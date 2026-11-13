import express from "express";
import {
  BookedRideModel,
  BookingModel,
  ChangeRequestModel,
  FlightModel,
  HotelModel,
  RideRequestModel,
  RouteModel,
  TaxiCompanyModel,
  TaxiOfferModel
} from "../models/schemas";
import {
  RuleError,
  checkVehicleFitsR5,
  checkVehicleFreeR6,
  computeBusyWindowR6,
  evaluateSuppliersInMemory,
  validateFlightAndHotelR1,
  validatePriceInRangeR3
} from "../services/ruleEngine";
import { isWithinServiceHours } from "../utils/time";
import { expireStaleOffers } from "./requestRoutes";

export const supplierRouter = express.Router();

async function generateNextOfferId(): Promise<string> {
  const existing = await TaxiOfferModel.find({}, { offer_id: 1 }).lean();
  let maxNumber = 0;

  for (const doc of existing) {
    const match = /^OFR-(\d+)$/.exec(doc.offer_id);
    if (match) {
      const parsed = Number(match[1]);
      if (parsed > maxNumber) {
        maxNumber = parsed;
      }
    }
  }

  return `OFR-${String(maxNumber + 1).padStart(4, "0")}`;
}

function parseOfferExpiryG4(body: Record<string, unknown>): Date | null {
  const rawSeconds = body.expires_in_seconds;
  const rawExpiresAt = body.expires_at;

  if (rawSeconds !== undefined && rawSeconds !== null && rawSeconds !== "") {
    const seconds = Number(rawSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new RuleError(
        "G4",
        "INVALID_EXPIRY_SECONDS",
        "Offer expiry duration (expires_in_seconds) must be a positive number of seconds."
      );
    }
    return new Date(Date.now() + Math.round(seconds * 1000));
  }

  if (rawExpiresAt !== undefined && rawExpiresAt !== null && rawExpiresAt !== "") {
    const parsedDate = new Date(String(rawExpiresAt));
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.getTime() <= Date.now()) {
      throw new RuleError(
        "G4",
        "INVALID_EXPIRY_TIMESTAMP",
        "Offer expiry timestamp (expires_at) must be a valid future time."
      );
    }
    return parsedDate;
  }

  return null;
}

function sendSupplierError(res: express.Response, err: unknown, fallbackCode: string): void {
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

  console.error(`${fallbackCode}:`, err);
  res.status(500).json({
    ok: false,
    error: {
      code: fallbackCode,
      message: "Unexpected server error in supplier service."
    }
  });
}

async function handleGetSupplierDashboard(
  req: express.Request,
  res: express.Response
): Promise<void> {
  try {
    await expireStaleOffers();

    const companyId = String(req.params.companyId || "").trim();
    const company = await TaxiCompanyModel.findOne({ company_id: companyId }).lean();

    if (!company) {
      res.status(404).json({
        ok: false,
        error: {
          code: "SUPPLIER_NOT_FOUND",
          message: `Taxi company "${companyId}" does not exist.`
        }
      });
      return;
    }

    const [
      openRequests,
      allRequests,
      flights,
      hotels,
      routes,
      bookedRides,
      confirmedBookings,
      myOffers,
      myBookings,
      changeRequests
    ] = await Promise.all([
      RideRequestModel.find({ status: "OPEN" }).sort({ created_at: -1, request_id: -1 }).lean(),
      RideRequestModel.find({}).lean(),
      FlightModel.find({}).lean(),
      HotelModel.find({}).lean(),
      RouteModel.find({}).lean(),
      BookedRideModel.find({}).lean(),
      BookingModel.find({ status: "CONFIRMED" }).lean(),
      TaxiOfferModel.find({ company_id: companyId }).sort({ created_at: -1 }).lean(),
      BookingModel.find({ company_id: companyId, status: "CONFIRMED" }).sort({ created_at: -1 }).lean(),
      ChangeRequestModel.find({ company_id: companyId }).sort({ created_at: -1 }).lean()
    ]);

    const flightById = new Map(flights.map((f) => [f.flight_id, f]));
    const hotelById = new Map(hotels.map((h) => [h.hotel_id, h]));
    const requestById = new Map(allRequests.map((r) => [r.request_id, r]));
    const routeByKey = new Map(
      routes.map((r) => [`${r.airport}::${r.city}::${r.area}`, r])
    );

    const offersByRequestId = new Map<string, typeof myOffers>();
    for (const offer of myOffers) {
      const bucket = offersByRequestId.get(offer.request_id) ?? [];
      bucket.push(offer);
      offersByRequestId.set(offer.request_id, bucket);
    }

    const servableRequests = [];
    for (const rideReq of openRequests) {
      const flight = flightById.get(rideReq.flight_id);
      const hotel = hotelById.get(rideReq.hotel_id);
      if (!flight || !hotel) {
        continue;
      }

      const route = routeByKey.get(`${flight.to}::${hotel.city}::${hotel.area}`);
      if (!route) {
        continue;
      }

      const report = evaluateSuppliersInMemory(
        rideReq,
        flight,
        hotel,
        route,
        [company],
        bookedRides,
        confirmedBookings
      );

      const companyEval = report.supplierEvaluations[0];
      if (!companyEval || !companyEval.servable) {
        continue;
      }

      const busyWindow = computeBusyWindowR6(rideReq.pickup, route.drive_minutes);
      const existingOffers = offersByRequestId.get(rideReq.request_id) ?? [];
      const activeVehicleIds = new Set(
        existingOffers.filter((o) => o.status === "OPEN").map((o) => o.vehicle_id)
      );

      servableRequests.push({
        request: rideReq,
        flight,
        hotel,
        route,
        busy_window: {
          start: busyWindow.busyStart,
          end: busyWindow.busyEnd
        },
        existing_offers: existingOffers,
        vehicle_evaluations: companyEval.vehicleEvaluations.map((ev) => ({
          vehicle: ev.vehicle,
          fits: ev.fits,
          free: ev.free,
          eligible: ev.eligible,
          broken_rule: ev.brokenRule ?? null,
          reason: ev.reason ?? null,
          conflict_source: ev.conflictSource ?? null,
          conflict_window: ev.conflictWindow ?? null,
          already_offered_open: activeVehicleIds.has(ev.vehicle.vehicle_id)
        }))
      });
    }

    const fleetTimeline = company.vehicles.map((vehicle) => {
      const prebookedSlots = bookedRides
        .filter((ride) => ride.vehicle_id === vehicle.vehicle_id)
        .map((ride) => ({
          source_type: "PREBOOKED" as const,
          reference_id: ride.ride_id,
          start: ride.start,
          end: ride.end
        }));

      const confirmedSlots = myBookings
        .filter((booking) => booking.vehicle_id === vehicle.vehicle_id)
        .map((booking) => ({
          source_type: "BOOKING" as const,
          reference_id: booking.booking_number,
          request_id: booking.request_id,
          flight_id: booking.flight_id,
          price_inr: booking.price_inr,
          start: booking.busy_start,
          end: booking.busy_end
        }));

      const busySlots = [...prebookedSlots, ...confirmedSlots].sort((a, b) =>
        a.start.localeCompare(b.start)
      );

      return {
        vehicle,
        busy_slots: busySlots
      };
    });

    const enrichedOffers = myOffers.map((offer) => {
      const rideReq = requestById.get(offer.request_id) ?? null;
      const flight = rideReq ? flightById.get(rideReq.flight_id) ?? null : null;
      const hotel = rideReq ? hotelById.get(rideReq.hotel_id) ?? null : null;
      const vehicle = company.vehicles.find((v) => v.vehicle_id === offer.vehicle_id) ?? null;

      return {
        ...offer,
        vehicle,
        request: rideReq,
        flight,
        hotel
      };
    });

    const enrichedBookings = myBookings.map((booking) => {
      const rideReq = requestById.get(booking.request_id) ?? null;
      const flight = flightById.get(booking.flight_id) ?? null;
      const hotel = hotelById.get(booking.hotel_id) ?? null;
      const vehicle = company.vehicles.find((v) => v.vehicle_id === booking.vehicle_id) ?? null;

      return {
        ...booking,
        vehicle,
        request: rideReq,
        flight,
        hotel
      };
    });

    const enrichedChanges = changeRequests.map((chg) => {
      const booking = myBookings.find((b) => b.booking_number === chg.booking_number) ?? null;
      const prevFlight = flightById.get(chg.prev_flight_id) ?? null;
      const newFlight = flightById.get(chg.new_flight_id) ?? null;
      const hotel = booking ? hotelById.get(booking.hotel_id) ?? null : null;

      return {
        ...chg,
        booking,
        prev_flight: prevFlight,
        new_flight: newFlight,
        hotel
      };
    });

    res.status(200).json({
      ok: true,
      data: {
        company,
        servable_requests: servableRequests,
        my_offers: enrichedOffers,
        my_bookings: enrichedBookings,
        change_requests: enrichedChanges,
        pending_change_requests: enrichedChanges.filter((c) => c.status === "PENDING"),
        fleet_timeline: fleetTimeline
      }
    });
  }
  catch (err) {
    sendSupplierError(res, err, "SUPPLIER_DASHBOARD_ERROR");
  }
}

async function handleCreateOffer(req: express.Request, res: express.Response): Promise<void> {
  try {
    await expireStaleOffers();

    const companyId = String(req.params.companyId || "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const requestId = typeof body.request_id === "string" ? body.request_id.trim() : "";
    const vehicleId = typeof body.vehicle_id === "string" ? body.vehicle_id.trim() : "";

    const company = await TaxiCompanyModel.findOne({ company_id: companyId }).lean();
    if (!company) {
      throw new RuleError(
        "R4",
        "UNKNOWN_SUPPLIER",
        `Rule R4 violated: Taxi company "${companyId}" does not exist.`,
        404
      );
    }

    if (!requestId || !vehicleId) {
      throw new RuleError(
        "R7",
        "MISSING_OFFER_FIELDS",
        "Rule R7 violated: Both request_id and vehicle_id are required to assign a car."
      );
    }

    const rideReq = await RideRequestModel.findOne({ request_id: requestId }).lean();
    if (!rideReq) {
      throw new RuleError(
        "R7",
        "REQUEST_NOT_FOUND",
        `Rule R7 violated: Ride request "${requestId}" does not exist.`,
        404
      );
    }

    if (rideReq.status !== "OPEN") {
      throw new RuleError(
        "R7",
        "REQUEST_NOT_OPEN",
        `Rule R7 violated: Ride request "${requestId}" is already ${rideReq.status} and cannot accept new cars.`,
        409
      );
    }

    const { flight, hotel, route } = await validateFlightAndHotelR1(
      rideReq.flight_id,
      rideReq.hotel_id
    );

    if (!company.airports.includes(flight.to)) {
      throw new RuleError(
        "R4",
        "SUPPLIER_AIRPORT_MISMATCH",
        `Rule R4 violated: ${company.name} does not operate at arrival airport ${flight.to}.`
      );
    }

    const servesArea = company.areas.some(
      (zone) => zone.city === hotel.city && zone.area === hotel.area
    );
    if (!servesArea) {
      throw new RuleError(
        "R4",
        "SUPPLIER_AREA_MISMATCH",
        `Rule R4 violated: ${company.name} does not serve ${hotel.city} (${hotel.area}).`
      );
    }

    if (!isWithinServiceHours(rideReq.pickup, company.service_from, company.service_until)) {
      throw new RuleError(
        "R4",
        "SUPPLIER_OUTSIDE_HOURS",
        `Rule R4 violated: ${company.name} is closed at pickup time ${rideReq.pickup.slice(11, 16)} (hours ${company.service_from}–${company.service_until}).`
      );
    }

    const vehicle = company.vehicles.find((v) => v.vehicle_id === vehicleId);
    if (!vehicle) {
      throw new RuleError(
        "R7",
        "VEHICLE_NOT_IN_FLEET",
        `Rule R7 violated: Vehicle "${vehicleId}" does not belong to ${company.name}.`
      );
    }

    const fitCheck = checkVehicleFitsR5(vehicle, rideReq);
    if (!fitCheck.fits) {
      const citedRule = fitCheck.rule === "G2" ? "R5" : (fitCheck.rule ?? "R5");
      const prefix =
        fitCheck.rule === "G2"
          ? "Rule R5 (Car Type G2) violated"
          : "Rule R5 violated";
      throw new RuleError(
        citedRule,
        fitCheck.rule === "G2" ? "CAR_TYPE_MISMATCH" : "VEHICLE_CAPACITY_EXCEEDED",
        `${prefix}: ${fitCheck.reason}`,
        422,
        {
          vehicle_id: vehicle.vehicle_id,
          vehicle_type: vehicle.type,
          seats: vehicle.seats,
          large_bags: vehicle.large_bags,
          small_bags: vehicle.small_bags
        }
      );
    }

    const { busyStart, busyEnd } = computeBusyWindowR6(rideReq.pickup, route.drive_minutes);
    const freeCheck = await checkVehicleFreeR6(vehicle.vehicle_id, busyStart, busyEnd);
    if (!freeCheck.free) {
      throw new RuleError(
        "R6",
        "VEHICLE_BUSY",
        `Rule R6 violated: ${freeCheck.reason} Needed busy window is ${busyStart}–${busyEnd}.`,
        422,
        {
          vehicle_id: vehicle.vehicle_id,
          needed_busy_window: [busyStart, busyEnd],
          conflict_source: freeCheck.conflictSource,
          conflict_window: freeCheck.conflictWindow
        }
      );
    }

    const priceInr = validatePriceInRangeR3(body.price_inr, route);
    const expiresAt = parseOfferExpiryG4(body);

    const duplicateOpenOffer = await TaxiOfferModel.findOne({
      request_id: rideReq.request_id,
      company_id: companyId,
      vehicle_id: vehicle.vehicle_id,
      status: "OPEN"
    }).lean();

    if (duplicateOpenOffer) {
      throw new RuleError(
        "R7",
        "DUPLICATE_VEHICLE_OFFER",
        `Rule R7 violated: Vehicle ${vehicle.vehicle_id} already has an active OPEN offer (${duplicateOpenOffer.offer_id}) on ${rideReq.request_id}. Pick another vehicle to offer multiple cars (G1).`,
        409
      );
    }

    const offerId = await generateNextOfferId();
    const createdOffer = await TaxiOfferModel.create({
      offer_id: offerId,
      request_id: rideReq.request_id,
      company_id: companyId,
      vehicle_id: vehicle.vehicle_id,
      price_inr: priceInr,
      expires_at: expiresAt,
      status: "OPEN",
      created_at: new Date()
    });

    res.status(201).json({
      ok: true,
      data: {
        offer: {
          ...createdOffer.toObject(),
          company_name: company.name,
          company_rating: company.rating,
          vehicle,
          price_delta_inr: priceInr - rideReq.price_inr
        },
        busy_window: {
          start: busyStart,
          end: busyEnd
        }
      }
    });
  }
  catch (err) {
    sendSupplierError(res, err, "CREATE_OFFER_ERROR");
  }
}

supplierRouter.get("/suppliers/:companyId/dashboard", handleGetSupplierDashboard);
supplierRouter.post("/suppliers/:companyId/offers", handleCreateOffer);
