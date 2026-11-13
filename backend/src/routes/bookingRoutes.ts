import crypto from "node:crypto";
import express from "express";
import {
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
  checkVehicleFreeR6,
  computeBusyWindowR6,
  validateFlightAndHotelR1
} from "../services/ruleEngine";
import { expireStaleOffers } from "./requestRoutes";

export const bookingRouter = express.Router();

// First digit is 1–9 so every generated identifier is strictly 10 digits with no leading-zero ambiguity
async function generateUnique10DigitBookingNumber(): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = String(crypto.randomInt(1_000_000_000, 10_000_000_000));
    const exists = await BookingModel.exists({ booking_number: candidate });
    if (!exists) {
      return candidate;
    }
  }

  throw new Error("Unable to allocate a unique 10-digit booking number.");
}

function sendBookingError(res: express.Response, err: unknown, fallbackCode: string): void {
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
      message: "Unexpected server error in booking service."
    }
  });
}

async function handleRejectOffer(req: express.Request, res: express.Response): Promise<void> {
  try {
    await expireStaleOffers();

    const offerId = String(req.params.offerId || "").trim();
    const offer = await TaxiOfferModel.findOne({ offer_id: offerId }).lean();

    if (!offer) {
      throw new RuleError(
        "R8",
        "OFFER_NOT_FOUND",
        `Rule R8 violated: Taxi offer "${offerId}" does not exist.`,
        404
      );
    }

    const rideReq = await RideRequestModel.findOne({ request_id: offer.request_id }).lean();
    if (!rideReq || rideReq.status !== "OPEN") {
      throw new RuleError(
        "R8",
        "REQUEST_NOT_OPEN",
        `Rule R8 violated: Ride request "${offer.request_id}" is already booked and its offers can no longer be changed.`,
        409
      );
    }

    if (offer.status === "REJECTED") {
      throw new RuleError(
        "R8",
        "OFFER_ALREADY_REJECTED",
        `Rule R8 violated: Offer "${offerId}" has already been rejected.`,
        409
      );
    }

    if (offer.status !== "OPEN") {
      throw new RuleError(
        "R8",
        "OFFER_NOT_OPEN",
        `Rule R8 violated: Offer "${offerId}" has status ${offer.status} and cannot be rejected.`,
        409
      );
    }

    await TaxiOfferModel.updateOne(
      { offer_id: offerId },
      { $set: { status: "REJECTED" } }
    );

    res.status(200).json({
      ok: true,
      data: {
        offer_id: offerId,
        request_id: offer.request_id,
        status: "REJECTED"
      }
    });
  }
  catch (err) {
    sendBookingError(res, err, "REJECT_OFFER_ERROR");
  }
}

async function handleBookOffer(req: express.Request, res: express.Response): Promise<void> {
  try {
    await expireStaleOffers();

    const offerId = String(req.params.offerId || "").trim();
    const offer = await TaxiOfferModel.findOne({ offer_id: offerId }).lean();

    if (!offer) {
      throw new RuleError(
        "R8",
        "OFFER_NOT_FOUND",
        `Rule R8 violated: Taxi offer "${offerId}" does not exist.`,
        404
      );
    }

    if (offer.status === "REJECTED") {
      throw new RuleError(
        "R8",
        "REJECTED_OFFER_CANNOT_BOOK",
        "Rule R8 violated: A rejected taxi offer cannot be booked.",
        422
      );
    }

    if (
      offer.status === "EXPIRED" ||
      (offer.expires_at && new Date(offer.expires_at).getTime() <= Date.now())
    ) {
      if (offer.status !== "EXPIRED") {
        await TaxiOfferModel.updateOne(
          { offer_id: offerId },
          { $set: { status: "EXPIRED" } }
        );
      }
      throw new RuleError(
        "G4",
        "OFFER_EXPIRED",
        "Offer expiry (G4) violated: This assigned taxi offer has ended and cannot be booked.",
        422
      );
    }

    if (offer.status === "BOOKED") {
      throw new RuleError(
        "R8",
        "OFFER_ALREADY_BOOKED",
        `Rule R8 violated: Offer "${offerId}" is already booked.`,
        409
      );
    }

    if (offer.status === "NOT_CHOSEN") {
      throw new RuleError(
        "R8",
        "OFFER_NOT_CHOSEN",
        `Rule R8 violated: Another taxi was already booked for request "${offer.request_id}".`,
        409
      );
    }

    const rideReq = await RideRequestModel.findOne({ request_id: offer.request_id }).lean();
    if (!rideReq) {
      throw new RuleError(
        "R8",
        "REQUEST_NOT_FOUND",
        `Rule R8 violated: Ride request "${offer.request_id}" was not found.`,
        404
      );
    }

    if (rideReq.status !== "OPEN") {
      throw new RuleError(
        "R8",
        "REQUEST_ALREADY_BOOKED",
        `Rule R8 violated: Ride request "${rideReq.request_id}" is already BOOKED.`,
        409
      );
    }

    const { flight, hotel, route } = await validateFlightAndHotelR1(
      rideReq.flight_id,
      rideReq.hotel_id
    );

    const company = await TaxiCompanyModel.findOne({ company_id: offer.company_id }).lean();
    if (!company) {
      throw new RuleError(
        "R4",
        "SUPPLIER_NOT_FOUND",
        `Rule R4 violated: Supplier "${offer.company_id}" no longer exists.`,
        404
      );
    }

    const vehicle = company.vehicles.find((v) => v.vehicle_id === offer.vehicle_id) ?? null;
    if (!vehicle) {
      throw new RuleError(
        "R7",
        "VEHICLE_NOT_FOUND",
        `Rule R7 violated: Vehicle "${offer.vehicle_id}" no longer exists in ${company.name}'s fleet.`,
        404
      );
    }

    // Sequential double-booking check (M6 / R6 / R8) right before confirming the booking
    const { busyStart, busyEnd } = computeBusyWindowR6(rideReq.pickup, route.drive_minutes);
    const freeCheck = await checkVehicleFreeR6(offer.vehicle_id, busyStart, busyEnd);

    if (!freeCheck.free) {
      throw new RuleError(
        "R6",
        "DOUBLE_BOOKING_PREVENTED",
        `Rule R6 / R8 violated: Cannot confirm booking because ${freeCheck.reason} Needed busy window is ${busyStart}–${busyEnd}.`,
        409,
        {
          vehicle_id: offer.vehicle_id,
          needed_busy_window: [busyStart, busyEnd],
          conflict_source: freeCheck.conflictSource,
          conflict_window: freeCheck.conflictWindow
        }
      );
    }

    const bookingNumber = await generateUnique10DigitBookingNumber();

    const createdBooking = await BookingModel.create({
      booking_number: bookingNumber,
      request_id: rideReq.request_id,
      offer_id: offer.offer_id,
      company_id: offer.company_id,
      vehicle_id: offer.vehicle_id,
      flight_id: rideReq.flight_id,
      hotel_id: rideReq.hotel_id,
      pickup: rideReq.pickup,
      busy_start: busyStart,
      busy_end: busyEnd,
      price_inr: offer.price_inr,
      status: "CONFIRMED",
      created_at: new Date()
    });

    await Promise.all([
      TaxiOfferModel.updateOne(
        { offer_id: offer.offer_id },
        { $set: { status: "BOOKED" } }
      ),
      TaxiOfferModel.updateMany(
        {
          request_id: rideReq.request_id,
          offer_id: { $ne: offer.offer_id },
          status: "OPEN"
        },
        { $set: { status: "NOT_CHOSEN" } }
      ),
      RideRequestModel.updateOne(
        { request_id: rideReq.request_id },
        { $set: { status: "BOOKED" } }
      )
    ]);

    res.status(201).json({
      ok: true,
      data: {
        booking: createdBooking.toObject(),
        request: {
          ...rideReq,
          status: "BOOKED"
        },
        flight,
        hotel,
        route,
        company: {
          company_id: company.company_id,
          name: company.name,
          rating: company.rating,
          service_from: company.service_from,
          service_until: company.service_until
        },
        vehicle,
        change_requests: []
      }
    });
  }
  catch (err) {
    sendBookingError(res, err, "BOOK_OFFER_ERROR");
  }
}

async function handleGetBookingSummary(
  req: express.Request,
  res: express.Response
): Promise<void> {
  try {
    const bookingNumber = String(req.params.bookingNumber || "").trim();
    const booking = await BookingModel.findOne({ booking_number: bookingNumber }).lean();

    if (!booking) {
      res.status(404).json({
        ok: false,
        error: {
          rule: "M5",
          code: "BOOKING_NOT_FOUND",
          message: `Booking "${bookingNumber}" not found.`
        }
      });
      return;
    }

    const [rideReq, flight, hotel, company, rawChanges] = await Promise.all([
      RideRequestModel.findOne({ request_id: booking.request_id }).lean(),
      FlightModel.findOne({ flight_id: booking.flight_id }).lean(),
      HotelModel.findOne({ hotel_id: booking.hotel_id }).lean(),
      TaxiCompanyModel.findOne({ company_id: booking.company_id }).lean(),
      ChangeRequestModel.find({ booking_number: booking.booking_number })
        .sort({ created_at: -1 })
        .lean()
    ]);

    const route =
      flight && hotel
        ? await RouteModel.findOne({
            airport: flight.to,
            city: hotel.city,
            area: hotel.area
          }).lean()
        : null;

    const vehicle = company?.vehicles.find((v) => v.vehicle_id === booking.vehicle_id) ?? null;

    const changeFlightIds = Array.from(
      new Set(
        rawChanges.flatMap((chg) => [chg.prev_flight_id, chg.new_flight_id])
      )
    );

    const changeFlights =
      changeFlightIds.length > 0
        ? await FlightModel.find({ flight_id: { $in: changeFlightIds } }).lean()
        : [];
    const changeFlightMap = new Map(changeFlights.map((f) => [f.flight_id, f]));

    const enrichedChanges = rawChanges.map((chg) => ({
      ...chg,
      prev_flight: changeFlightMap.get(chg.prev_flight_id) ?? null,
      new_flight: changeFlightMap.get(chg.new_flight_id) ?? null
    }));

    res.status(200).json({
      ok: true,
      data: {
        booking,
        request: rideReq,
        flight,
        hotel,
        route,
        company: company
          ? {
              company_id: company.company_id,
              name: company.name,
              rating: company.rating,
              airports: company.airports,
              service_from: company.service_from,
              service_until: company.service_until
            }
          : null,
        vehicle,
        change_requests: enrichedChanges
      }
    });
  }
  catch (err) {
    sendBookingError(res, err, "GET_BOOKING_SUMMARY_ERROR");
  }
}

bookingRouter.post("/offers/:offerId/reject", handleRejectOffer);
bookingRouter.post("/offers/:offerId/book", handleBookOffer);
bookingRouter.get("/bookings/:bookingNumber", handleGetBookingSummary);
