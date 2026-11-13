import express from "express";
import {
  BookingModel,
  ChangeRequestModel,
  FlightModel,
  RideRequestModel,
  TaxiCompanyModel
} from "../models/schemas";
import {
  RuleError,
  checkVehicleFreeR6,
  computeBusyWindowR6,
  resolveAndValidatePickupR2,
  validateFlightAndHotelR1
} from "../services/ruleEngine";
import { isWithinServiceHours } from "../utils/time";

export const changeRouter = express.Router();

async function generateNextChangeId(): Promise<string> {
  const existing = await ChangeRequestModel.find({}, { change_id: 1 }).lean();
  let maxNumber = 0;

  for (const doc of existing) {
    const match = /^CHG-(\d+)$/.exec(doc.change_id);
    if (match) {
      const parsed = Number(match[1]);
      if (parsed > maxNumber) {
        maxNumber = parsed;
      }
    }
  }

  return `CHG-${String(maxNumber + 1).padStart(4, "0")}`;
}

function sendChangeError(res: express.Response, err: unknown, fallbackCode: string): void {
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
      message: "Unexpected server error in change-request service."
    }
  });
}

async function handleCreateChangeRequest(
  req: express.Request,
  res: express.Response
): Promise<void> {
  try {
    const bookingNumber = String(req.params.bookingNumber || "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;

    const booking = await BookingModel.findOne({ booking_number: bookingNumber }).lean();
    if (!booking) {
      throw new RuleError(
        "M5",
        "BOOKING_NOT_FOUND",
        `Booking "${bookingNumber}" not found.`,
        404
      );
    }

    const existingPending = await ChangeRequestModel.findOne({
      booking_number: booking.booking_number,
      status: "PENDING"
    }).lean();

    if (existingPending) {
      throw new RuleError(
        "R9",
        "PENDING_CHANGE_EXISTS",
        `Rule R9 violated: Booking #${booking.booking_number} already has a pending change request (${existingPending.change_id}) awaiting supplier decision.`,
        409
      );
    }

    const rawNewFlightId =
      typeof body.new_flight_id === "string" && body.new_flight_id.trim() !== ""
        ? body.new_flight_id.trim()
        : booking.flight_id;

    const rawNewPickup =
      typeof body.new_pickup === "string"
        ? body.new_pickup.trim()
        : body.new_pickup === null || body.new_pickup === undefined
          ? ""
          : String(body.new_pickup).trim();

    if (rawNewFlightId === booking.flight_id && rawNewPickup === "") {
      throw new RuleError(
        "R9",
        "NO_CHANGE_SPECIFIED",
        "Rule R9 violated: Provide a new arrival flight, a new pickup time, or both."
      );
    }

    const routeCtx = await validateFlightAndHotelR1(rawNewFlightId, booking.hotel_id);
    const resolvedNewPickup = resolveAndValidatePickupR2(
      routeCtx.flight.arrival_local,
      rawNewPickup === "" ? null : rawNewPickup
    );

    if (rawNewFlightId === booking.flight_id && resolvedNewPickup === booking.pickup) {
      throw new RuleError(
        "R9",
        "IDENTICAL_BOOKING_DETAILS",
        "Rule R9 violated: The requested flight and pickup time match the existing booking."
      );
    }

    const { busyStart, busyEnd } = computeBusyWindowR6(
      resolvedNewPickup,
      routeCtx.route.drive_minutes
    );

    const [prevFlight, company, freePreview] = await Promise.all([
      FlightModel.findOne({ flight_id: booking.flight_id }).lean(),
      TaxiCompanyModel.findOne({ company_id: booking.company_id }).lean(),
      checkVehicleFreeR6(booking.vehicle_id, busyStart, busyEnd, booking.booking_number)
    ]);

    const supplierWorksAtNewAirport = company
      ? company.airports.includes(routeCtx.flight.to)
      : false;
    const supplierOpenAtNewPickup = company
      ? isWithinServiceHours(resolvedNewPickup, company.service_from, company.service_until)
      : false;

    const changeId = await generateNextChangeId();
    const createdChange = await ChangeRequestModel.create({
      change_id: changeId,
      booking_number: booking.booking_number,
      company_id: booking.company_id,
      prev_flight_id: booking.flight_id,
      prev_pickup: booking.pickup,
      new_flight_id: routeCtx.flight.flight_id,
      new_pickup: resolvedNewPickup,
      new_busy_start: busyStart,
      new_busy_end: busyEnd,
      status: "PENDING",
      decision_reason: null,
      created_at: new Date()
    });

    res.status(201).json({
      ok: true,
      data: {
        change_request: {
          ...createdChange.toObject(),
          prev_flight: prevFlight,
          new_flight: routeCtx.flight
        },
        feasibility_preview: {
          car_free_at_new_time: freePreview.free,
          conflict_reason: freePreview.reason ?? null,
          supplier_serves_new_airport: supplierWorksAtNewAirport,
          supplier_open_at_new_pickup: supplierOpenAtNewPickup
        }
      }
    });
  }
  catch (err) {
    sendChangeError(res, err, "CREATE_CHANGE_REQUEST_ERROR");
  }
}

async function handleDecideChangeRequest(
  req: express.Request,
  res: express.Response
): Promise<void> {
  try {
    const changeId = String(req.params.changeId || "").trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawDecision = typeof body.decision === "string" ? body.decision.trim().toUpperCase() : "";
    const reasonInput =
      typeof body.reason === "string" && body.reason.trim() !== ""
        ? body.reason.trim()
        : null;

    if (
      rawDecision !== "ACCEPT" &&
      rawDecision !== "ACCEPTED" &&
      rawDecision !== "REJECT" &&
      rawDecision !== "REJECTED"
    ) {
      throw new RuleError(
        "R9",
        "INVALID_DECISION",
        'Rule R9 violated: Decision must be "ACCEPT" or "REJECT".'
      );
    }

    const changeReq = await ChangeRequestModel.findOne({ change_id: changeId }).lean();
    if (!changeReq) {
      throw new RuleError(
        "R9",
        "CHANGE_REQUEST_NOT_FOUND",
        `Rule R9 violated: Change request "${changeId}" was not found.`,
        404
      );
    }

    if (changeReq.status !== "PENDING") {
      throw new RuleError(
        "R9",
        "CHANGE_ALREADY_DECIDED",
        `Rule R9 violated: Change request "${changeId}" has already been ${changeReq.status}.`,
        409
      );
    }

    const booking = await BookingModel.findOne({
      booking_number: changeReq.booking_number
    }).lean();

    if (!booking) {
      throw new RuleError(
        "M5",
        "BOOKING_NOT_FOUND",
        `Booking "${changeReq.booking_number}" was not found.`,
        404
      );
    }

    if (rawDecision === "REJECT" || rawDecision === "REJECTED") {
      const rejectionReason = reasonInput ?? "Change request rejected by supplier; original booking kept.";

      await ChangeRequestModel.updateOne(
        { change_id: changeId },
        {
          $set: {
            status: "REJECTED",
            decision_reason: rejectionReason
          }
        }
      );

      res.status(200).json({
        ok: true,
        data: {
          change_request: {
            ...changeReq,
            status: "REJECTED",
            decision_reason: rejectionReason
          },
          booking
        }
      });
      return;
    }

    const routeCtx = await validateFlightAndHotelR1(changeReq.new_flight_id, booking.hotel_id);
    const validatedPickup = resolveAndValidatePickupR2(
      routeCtx.flight.arrival_local,
      changeReq.new_pickup
    );

    const company = await TaxiCompanyModel.findOne({ company_id: booking.company_id }).lean();
    if (!company) {
      throw new RuleError(
        "R4",
        "SUPPLIER_NOT_FOUND",
        `Rule R4 violated: Supplier "${booking.company_id}" was not found.`,
        404
      );
    }

    if (!company.airports.includes(routeCtx.flight.to)) {
      throw new RuleError(
        "R9",
        "SUPPLIER_AIRPORT_MISMATCH_ON_CHANGE",
        `Rule R9 / R4 violated: Cannot accept change because ${company.name} does not operate at ${routeCtx.flight.to}.`
      );
    }

    if (!isWithinServiceHours(validatedPickup, company.service_from, company.service_until)) {
      throw new RuleError(
        "R9",
        "SUPPLIER_CLOSED_AT_NEW_PICKUP",
        `Rule R9 / R4 violated: Cannot accept change because ${company.name} is closed at ${validatedPickup.slice(11, 16)} (hours ${company.service_from}–${company.service_until}).`
      );
    }

    const { busyStart, busyEnd } = computeBusyWindowR6(
      validatedPickup,
      routeCtx.route.drive_minutes
    );

    // Exclude booking.booking_number so shifting a booking by e.g. +30m never conflicts with its own old slot
    const freeCheck = await checkVehicleFreeR6(
      booking.vehicle_id,
      busyStart,
      busyEnd,
      booking.booking_number
    );

    if (!freeCheck.free) {
      throw new RuleError(
        "R9",
        "SAME_CAR_BUSY_AT_NEW_TIME",
        `Rule R9 / R6 violated: Cannot accept change because assigned car ${booking.vehicle_id} is not free during ${busyStart}–${busyEnd}. ${freeCheck.reason}`,
        422,
        {
          vehicle_id: booking.vehicle_id,
          new_busy_window: [busyStart, busyEnd],
          conflict_source: freeCheck.conflictSource,
          conflict_window: freeCheck.conflictWindow
        }
      );
    }

    const acceptanceReason = reasonInput ?? "Change request accepted by supplier.";

    await Promise.all([
      BookingModel.updateOne(
        { booking_number: booking.booking_number },
        {
          $set: {
            flight_id: routeCtx.flight.flight_id,
            pickup: validatedPickup,
            busy_start: busyStart,
            busy_end: busyEnd
          }
        }
      ),
      RideRequestModel.updateOne(
        { request_id: booking.request_id },
        {
          $set: {
            flight_id: routeCtx.flight.flight_id,
            pickup: validatedPickup
          }
        }
      ),
      ChangeRequestModel.updateOne(
        { change_id: changeId },
        {
          $set: {
            status: "ACCEPTED",
            new_pickup: validatedPickup,
            new_busy_start: busyStart,
            new_busy_end: busyEnd,
            decision_reason: acceptanceReason
          }
        }
      )
    ]);

    const updatedBooking = await BookingModel.findOne({
      booking_number: booking.booking_number
    }).lean();

    res.status(200).json({
      ok: true,
      data: {
        change_request: {
          ...changeReq,
          status: "ACCEPTED",
          new_pickup: validatedPickup,
          new_busy_start: busyStart,
          new_busy_end: busyEnd,
          decision_reason: acceptanceReason
        },
        booking: updatedBooking
      }
    });
  }
  catch (err) {
    sendChangeError(res, err, "DECIDE_CHANGE_REQUEST_ERROR");
  }
}

changeRouter.post("/bookings/:bookingNumber/change-requests", handleCreateChangeRequest);
changeRouter.post("/change-requests/:changeId/decision", handleDecideChangeRequest);
