import express from "express";
import {
  BookedRideModel,
  BookingModel,
  FlightModel,
  HotelModel,
  RideRequestModel,
  RouteModel,
  TaxiCompanyModel,
  TaxiOfferModel
} from "../models/schemas";
import {
  RuleError,
  checkVehicleFreeInMemory,
  computeBusyWindowR6,
  evaluateSuppliersForRequestR4,
  evaluateSuppliersInMemory,
  resolveAndValidatePickupR2,
  validateFlightAndHotelR1,
  validatePassengersAndBagsR1,
  validatePriceInRangeR3
} from "../services/ruleEngine";

export const requestRouter = express.Router();

export async function expireStaleOffers(): Promise<void> {
  await TaxiOfferModel.updateMany(
    {
      status: "OPEN",
      expires_at: { $ne: null, $lte: new Date() }
    },
    {
      $set: { status: "EXPIRED" }
    }
  );
}

async function generateNextRequestId(): Promise<string> {
  const existing = await RideRequestModel.find({}, { request_id: 1 }).lean();
  let maxNumber = 0;

  for (const doc of existing) {
    const match = /^REQ-(\d+)$/.exec(doc.request_id);
    if (match) {
      const parsed = Number(match[1]);
      if (parsed > maxNumber) {
        maxNumber = parsed;
      }
    }
  }

  return `REQ-${String(maxNumber + 1).padStart(4, "0")}`;
}

function sendRouteError(res: express.Response, err: unknown, fallbackCode: string): void {
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
      message: "Unexpected server error while processing ride request."
    }
  });
}

async function handleListRequests(_req: express.Request, res: express.Response): Promise<void> {
  try {
    await expireStaleOffers();

    const [
      requests,
      flights,
      hotels,
      routes,
      companies,
      bookedRides,
      confirmedBookings,
      offers
    ] = await Promise.all([
      RideRequestModel.find({}).sort({ created_at: -1, request_id: -1 }).lean(),
      FlightModel.find({}).lean(),
      HotelModel.find({}).lean(),
      RouteModel.find({}).lean(),
      TaxiCompanyModel.find({}).sort({ company_id: 1 }).lean(),
      BookedRideModel.find({}).lean(),
      BookingModel.find({ status: "CONFIRMED" }).lean(),
      TaxiOfferModel.find({}).lean()
    ]);

    const flightById = new Map(flights.map((f) => [f.flight_id, f]));
    const hotelById = new Map(hotels.map((h) => [h.hotel_id, h]));
    const routeByKey = new Map(
      routes.map((r) => [`${r.airport}::${r.city}::${r.area}`, r])
    );
    const bookingByRequestId = new Map(
      confirmedBookings.map((b) => [b.request_id, b])
    );

    const openOffersCount = new Map<string, number>();
    const totalOffersCount = new Map<string, number>();
    for (const offer of offers) {
      totalOffersCount.set(offer.request_id, (totalOffersCount.get(offer.request_id) ?? 0) + 1);
      if (offer.status === "OPEN") {
        openOffersCount.set(offer.request_id, (openOffersCount.get(offer.request_id) ?? 0) + 1);
      }
    }

    const enriched = requests.map((rideReq) => {
      const flight = flightById.get(rideReq.flight_id) ?? null;
      const hotel = hotelById.get(rideReq.hotel_id) ?? null;
      const route =
        flight && hotel
          ? routeByKey.get(`${flight.to}::${hotel.city}::${hotel.area}`) ?? null
          : null;

      const busyWindow = route
        ? computeBusyWindowR6(rideReq.pickup, route.drive_minutes)
        : null;

      let servableCount = 0;
      let servableCompanyIds: string[] = [];
      let unservableReasons: string[] = [];

      if (flight && hotel && route) {
        const report = evaluateSuppliersInMemory(
          rideReq,
          flight,
          hotel,
          route,
          companies,
          bookedRides,
          confirmedBookings
        );
        servableCount = report.servableCount;
        servableCompanyIds = report.servableCompanyIds;
        unservableReasons = report.unservableReasons;
      }

      const linkedBooking = bookingByRequestId.get(rideReq.request_id) ?? null;

      return {
        ...rideReq,
        flight,
        hotel,
        route,
        busy_window: busyWindow
          ? { start: busyWindow.busyStart, end: busyWindow.busyEnd }
          : null,
        open_offers_count: openOffersCount.get(rideReq.request_id) ?? 0,
        total_offers_count: totalOffersCount.get(rideReq.request_id) ?? 0,
        booking_number: linkedBooking?.booking_number ?? null,
        servability: {
          servable_count: servableCount,
          servable_company_ids: servableCompanyIds,
          unservable_reasons: unservableReasons
        }
      };
    });

    res.status(200).json({
      ok: true,
      data: {
        requests: enriched
      }
    });
  }
  catch (err) {
    sendRouteError(res, err, "LIST_REQUESTS_ERROR");
  }
}

async function handleCreateRequest(req: express.Request, res: express.Response): Promise<void> {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const flightId = typeof body.flight_id === "string" ? body.flight_id.trim() : "";
    const hotelId = typeof body.hotel_id === "string" ? body.hotel_id.trim() : "";
    const travelerNameRaw = typeof body.traveler_name === "string" ? body.traveler_name.trim() : "";
    const travelerName = travelerNameRaw.length > 0 ? travelerNameRaw : "Traveler";

    const routeCtx = await validateFlightAndHotelR1(flightId, hotelId);
    const paxAndBags = validatePassengersAndBagsR1({
      adults: body.adults,
      child_ages: body.child_ages === undefined ? [] : body.child_ages,
      large_bags: body.large_bags,
      small_bags: body.small_bags,
      car_type: body.car_type
    });

    const requestedPickup =
      typeof body.pickup === "string" || body.pickup === null || body.pickup === undefined
        ? (body.pickup as string | null | undefined)
        : String(body.pickup);

    const pickup = resolveAndValidatePickupR2(routeCtx.flight.arrival_local, requestedPickup);
    const priceInr = validatePriceInRangeR3(body.price_inr, routeCtx.route);

    const requestId = await generateNextRequestId();

    const createdDoc = await RideRequestModel.create({
      request_id: requestId,
      traveler_name: travelerName,
      flight_id: routeCtx.flight.flight_id,
      hotel_id: routeCtx.hotel.hotel_id,
      adults: paxAndBags.adults,
      child_ages: paxAndBags.child_ages,
      large_bags: paxAndBags.large_bags,
      small_bags: paxAndBags.small_bags,
      pickup,
      car_type: paxAndBags.car_type,
      price_inr: priceInr,
      status: "OPEN",
      created_at: new Date()
    });

    const servability = await evaluateSuppliersForRequestR4({
      flight_id: createdDoc.flight_id,
      hotel_id: createdDoc.hotel_id,
      adults: createdDoc.adults,
      child_ages: createdDoc.child_ages,
      large_bags: createdDoc.large_bags,
      small_bags: createdDoc.small_bags,
      pickup: createdDoc.pickup,
      car_type: createdDoc.car_type
    });

    const busyWindow = computeBusyWindowR6(createdDoc.pickup, routeCtx.route.drive_minutes);

    res.status(201).json({
      ok: true,
      data: {
        request: createdDoc.toObject(),
        flight: routeCtx.flight,
        hotel: routeCtx.hotel,
        route: routeCtx.route,
        busy_window: {
          start: busyWindow.busyStart,
          end: busyWindow.busyEnd
        },
        servability: {
          servable_count: servability.servableCount,
          servable_company_ids: servability.servableCompanyIds,
          unservable_reasons: servability.unservableReasons
        }
      }
    });
  }
  catch (err) {
    sendRouteError(res, err, "CREATE_REQUEST_ERROR");
  }
}

async function handleGetRequestDetail(req: express.Request, res: express.Response): Promise<void> {
  try {
    await expireStaleOffers();

    const requestId = String(req.params.requestId || "").trim();
    const rideReq = await RideRequestModel.findOne({ request_id: requestId }).lean();

    if (!rideReq) {
      res.status(404).json({
        ok: false,
        error: {
          code: "REQUEST_NOT_FOUND",
          message: `Ride request "${requestId}" was not found.`
        }
      });
      return;
    }

    const routeCtx = await validateFlightAndHotelR1(rideReq.flight_id, rideReq.hotel_id);
    const busyWindow = computeBusyWindowR6(rideReq.pickup, routeCtx.route.drive_minutes);

    const [companies, bookedRides, confirmedBookings, rawOffers, linkedBooking] = await Promise.all([
      TaxiCompanyModel.find({}).sort({ company_id: 1 }).lean(),
      BookedRideModel.find({}).lean(),
      BookingModel.find({ status: "CONFIRMED" }).lean(),
      TaxiOfferModel.find({ request_id: requestId }).sort({ created_at: 1 }).lean(),
      BookingModel.findOne({ request_id: requestId, status: "CONFIRMED" }).lean()
    ]);

    const companyById = new Map(companies.map((c) => [c.company_id, c]));

    const servability = evaluateSuppliersInMemory(
      rideReq,
      routeCtx.flight,
      routeCtx.hotel,
      routeCtx.route,
      companies,
      bookedRides,
      confirmedBookings
    );

    let enrichedOffers = rawOffers.map((offer) => {
      const company = companyById.get(offer.company_id) ?? null;
      const vehicle = company?.vehicles.find((v) => v.vehicle_id === offer.vehicle_id) ?? null;

      const freeCheck = checkVehicleFreeInMemory(
        offer.vehicle_id,
        busyWindow.busyStart,
        busyWindow.busyEnd,
        bookedRides,
        confirmedBookings,
        linkedBooking?.booking_number
      );

      return {
        ...offer,
        company_name: company?.name ?? offer.company_id,
        company_rating: company?.rating ?? null,
        vehicle,
        price_delta_inr: offer.price_inr - rideReq.price_inr,
        car_currently_free: freeCheck.free,
        conflict_reason: freeCheck.reason ?? null
      };
    });

    const rawCarTypeFilter =
      typeof req.query.carType === "string"
        ? req.query.carType.trim().toUpperCase()
        : typeof req.query.car_type === "string"
          ? req.query.car_type.trim().toUpperCase()
          : "";

    if (rawCarTypeFilter && rawCarTypeFilter !== "ALL") {
      enrichedOffers = enrichedOffers.filter(
        (offer) => offer.vehicle?.type === rawCarTypeFilter
      );
    }

    const sortParam = typeof req.query.sort === "string" ? req.query.sort.trim() : "";
    if (sortParam === "price_asc") {
      enrichedOffers.sort((a, b) => a.price_inr - b.price_inr);
    }
    else if (sortParam === "price_desc") {
      enrichedOffers.sort((a, b) => b.price_inr - a.price_inr);
    }

    res.status(200).json({
      ok: true,
      data: {
        request: rideReq,
        flight: routeCtx.flight,
        hotel: routeCtx.hotel,
        route: routeCtx.route,
        busy_window: {
          start: busyWindow.busyStart,
          end: busyWindow.busyEnd
        },
        booking: linkedBooking,
        servability: {
          servable_count: servability.servableCount,
          servable_company_ids: servability.servableCompanyIds,
          unservable_reasons: servability.unservableReasons
        },
        offers: enrichedOffers
      }
    });
  }
  catch (err) {
    sendRouteError(res, err, "GET_REQUEST_DETAIL_ERROR");
  }
}

requestRouter.get("/requests", handleListRequests);
requestRouter.post("/requests", handleCreateRequest);
requestRouter.get("/requests/:requestId", handleGetRequestDetail);
