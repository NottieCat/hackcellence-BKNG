import express from "express";
import {
  AirportModel,
  BookedRideModel,
  BookingModel,
  ChangeRequestModel,
  FlightModel,
  HotelModel,
  RideRequestModel,
  RouteModel,
  TaxiCompanyModel
} from "../models/schemas";
import {
  RuleError,
  evaluateSuppliersInMemory,
  validateFlightAndHotelR1
} from "../services/ruleEngine";

export const catalogRouter = express.Router();

async function handleGetBootstrap(_req: express.Request, res: express.Response): Promise<void> {
  try {
    const airports = await AirportModel.find({ "serves_cities.0": { $exists: true } })
      .sort({ code: 1 })
      .lean();
    const arrivalCodes = airports.map((airport) => airport.code);

    const [
      allFlights,
      hotels,
      routes,
      companies,
      openRequests,
      bookedRides,
      confirmedBookings,
      pendingChanges
    ] = await Promise.all([
      FlightModel.find({ to: { $in: arrivalCodes } }).sort({ arrival_local: 1, flight_id: 1 }).lean(),
      HotelModel.find({}).sort({ city: 1, area: 1, name: 1 }).lean(),
      RouteModel.find({}).sort({ airport: 1, city: 1, area: 1 }).lean(),
      TaxiCompanyModel.find({}).sort({ company_id: 1 }).lean(),
      RideRequestModel.find({ status: "OPEN" }).lean(),
      BookedRideModel.find({}).lean(),
      BookingModel.find({ status: "CONFIRMED" }).lean(),
      ChangeRequestModel.find({ status: "PENDING" }).lean()
    ]);

    const flightById = new Map(allFlights.map((f) => [f.flight_id, f]));
    const hotelById = new Map(hotels.map((h) => [h.hotel_id, h]));
    const routeByKey = new Map(
      routes.map((r) => [`${r.airport}::${r.city}::${r.area}`, r])
    );

    const servableCountByCompany = new Map<string, number>();
    for (const req of openRequests) {
      const flight = flightById.get(req.flight_id);
      const hotel = hotelById.get(req.hotel_id);
      if (!flight || !hotel) {
        continue;
      }
      const route = routeByKey.get(`${flight.to}::${hotel.city}::${hotel.area}`);
      if (!route) {
        continue;
      }

      const report = evaluateSuppliersInMemory(
        req,
        flight,
        hotel,
        route,
        companies,
        bookedRides,
        confirmedBookings
      );

      for (const companyId of report.servableCompanyIds) {
        const current = servableCountByCompany.get(companyId) ?? 0;
        servableCountByCompany.set(companyId, current + 1);
      }
    }

    const pendingByCompany = new Map<string, number>();
    for (const change of pendingChanges) {
      const current = pendingByCompany.get(change.company_id) ?? 0;
      pendingByCompany.set(change.company_id, current + 1);
    }

    const suppliers = companies.map((company) => ({
      ...company,
      servable_open_count: servableCountByCompany.get(company.company_id) ?? 0,
      pending_changes_count: pendingByCompany.get(company.company_id) ?? 0
    }));

    res.status(200).json({
      ok: true,
      data: {
        airports,
        flights: allFlights,
        hotels,
        routes,
        suppliers
      }
    });
  }
  catch (err) {
    console.error("Bootstrap fetch error:", err);
    res.status(500).json({
      ok: false,
      error: {
        code: "BOOTSTRAP_ERROR",
        message: "Unable to load catalog data from database."
      }
    });
  }
}

async function handleGetRouteQuote(req: express.Request, res: express.Response): Promise<void> {
  try {
    const flightId = typeof req.query.flightId === "string" ? req.query.flightId.trim() : "";
    const hotelId = typeof req.query.hotelId === "string" ? req.query.hotelId.trim() : "";

    const context = await validateFlightAndHotelR1(flightId, hotelId);

    res.status(200).json({
      ok: true,
      data: {
        flight: context.flight,
        hotel: context.hotel,
        airport: context.airport,
        route: context.route,
        earliest_pickup: context.earliestPickup,
        price_min_inr: context.route.price_min_inr,
        price_max_inr: context.route.price_max_inr,
        drive_minutes: context.route.drive_minutes,
        distance_km: context.route.distance_km
      }
    });
  }
  catch (err) {
    if (err instanceof RuleError) {
      res.status(err.status).json({
        ok: false,
        error: {
          rule: err.rule,
          code: err.code,
          message: err.message,
          details: err.details
        }
      });
      return;
    }

    console.error("Route quote error:", err);
    res.status(500).json({
      ok: false,
      error: {
        code: "QUOTE_ERROR",
        message: "Unexpected error calculating route quote."
      }
    });
  }
}

catalogRouter.get("/catalog/bootstrap", handleGetBootstrap);
catalogRouter.get("/routes/quote", handleGetRouteQuote);
