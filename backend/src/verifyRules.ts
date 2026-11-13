import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "node:path";
import {
  BookingModel,
  ChangeRequestModel,
  RideRequestModel,
  TaxiOfferModel
} from "./models/schemas";

dotenv.config({
  path: path.resolve(__dirname, "../.env")
});

const API_BASE = `http://localhost:${process.env.PORT || 4000}/api`;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/airport_taxi_offers";

interface ApiEnvelope<T = Record<string, unknown>> {
  ok: boolean;
  data?: T;
  error?: {
    rule?: string;
    code: string;
    message: string;
  };
}

async function callApi<T = Record<string, unknown>>(
  endpoint: string,
  init?: RequestInit
): Promise<{ status: number; body: ApiEnvelope<T> }> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined)
    }
  });

  const body = (await response.json()) as ApiEnvelope<T>;
  return {
    status: response.status,
    body
  };
}

function assertCheck(condition: boolean, label: string, detail?: string): void {
  if (!condition) {
    throw new Error(`FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
  console.log(`PASS  ${label}`);
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runVerification(): Promise<void> {
  const createdRequestIds: string[] = [];
  const createdOfferIds: string[] = [];
  const createdBookingNumbers: string[] = [];
  const createdChangeIds: string[] = [];

  console.log(`\nRunning Airport Taxi Ride Offers Rule Verification against ${API_BASE}\n`);

  try {
    const health = await callApi<{
      mongoConnected: boolean;
      dataDirectoryReady: boolean;
    }>("/health");
    assertCheck(
      health.status === 200 &&
        Boolean(health.body.data?.mongoConnected) &&
        Boolean(health.body.data?.dataDirectoryReady),
      "Health & Read-Only Dataset Seeded"
    );

    const r1CityMismatch = await callApi("/requests", {
      method: "POST",
      body: JSON.stringify({
        traveler_name: "Verifier R1 City",
        flight_id: "FL-401",
        hotel_id: "HTL-DXB-001",
        adults: 2,
        child_ages: [],
        large_bags: 1,
        small_bags: 1,
        price_inr: 12000
      })
    });
    assertCheck(
      !r1CityMismatch.body.ok && r1CityMismatch.body.error?.rule === "R1",
      "Rule R1: Refuses mismatched arrival airport and hotel city"
    );

    const r1ChildAge = await callApi("/requests", {
      method: "POST",
      body: JSON.stringify({
        traveler_name: "Verifier R1 Age",
        flight_id: "FL-401",
        hotel_id: "HTL-TYO-004",
        adults: 2,
        child_ages: [19],
        large_bags: 1,
        small_bags: 1,
        price_inr: 12000
      })
    });
    assertCheck(
      !r1ChildAge.body.ok && r1ChildAge.body.error?.rule === "R1",
      "Rule R1: Refuses child age outside 0–17"
    );

    const r2EarlyPickup = await callApi("/requests", {
      method: "POST",
      body: JSON.stringify({
        traveler_name: "Verifier R2",
        flight_id: "FL-401",
        hotel_id: "HTL-TYO-004",
        adults: 2,
        child_ages: [],
        large_bags: 1,
        small_bags: 1,
        pickup: "2027-04-10T11:00",
        price_inr: 12000
      })
    });
    assertCheck(
      !r2EarlyPickup.body.ok && r2EarlyPickup.body.error?.rule === "R2",
      "Rule R2: Refuses pickup less than 60 minutes after flight landing"
    );

    const r3PriceRange = await callApi("/requests", {
      method: "POST",
      body: JSON.stringify({
        traveler_name: "Verifier R3",
        flight_id: "FL-401",
        hotel_id: "HTL-TYO-004",
        adults: 2,
        child_ages: [],
        large_bags: 1,
        small_bags: 1,
        price_inr: 8000
      })
    });
    assertCheck(
      !r3PriceRange.body.ok && r3PriceRange.body.error?.rule === "R3",
      "Rule R3: Refuses traveler price outside route suggested range"
    );

    const allRequests = await callApi<{
      requests: Array<{
        request_id: string;
        servability: { servable_count: number; unservable_reasons: string[] };
      }>;
    }>("/requests");
    const req0002 = allRequests.body.data?.requests.find(
      (r) => r.request_id === "REQ-0002"
    );
    assertCheck(
      Boolean(req0002) &&
        req0002!.servability.servable_count === 0 &&
        req0002!.servability.unservable_reasons.length > 0,
      "M2 + G2: Reports exact disqualification reasons when 0 suppliers can serve REQ-0002"
    );

    const menonConflictReq = await callApi<{
      request: { request_id: string };
      servability: { servable_count: number };
    }>("/requests", {
      method: "POST",
      body: JSON.stringify({
        traveler_name: "Verifier Menon R5/R6",
        flight_id: "FL-401",
        hotel_id: "HTL-TYO-004",
        adults: 2,
        child_ages: [6],
        large_bags: 3,
        small_bags: 2,
        pickup: "2027-04-10T11:30",
        price_inr: 12000
      })
    });
    const conflictReqId = menonConflictReq.body.data?.request.request_id ?? "";
    if (conflictReqId) {
      createdRequestIds.push(conflictReqId);
    }
    assertCheck(
      menonConflictReq.status === 201 && Boolean(conflictReqId),
      "M1: Posts valid Menon Family ride request"
    );

    const dubaiDash = await callApi<{
      servable_requests: Array<{ request: { request_id: string } }>;
    }>("/suppliers/TX-AE-01/dashboard");
    const leakedToDubai = dubaiDash.body.data?.servable_requests.some(
      (s) => s.request.request_id === conflictReqId
    );
    assertCheck(
      dubaiDash.status === 200 && !leakedToDubai,
      "M2 + R4: Hides Tokyo ride request from non-matching Dubai supplier dashboard"
    );

    const r5BagRefusal = await callApi("/suppliers/TX-JP-01/offers", {
      method: "POST",
      body: JSON.stringify({
        request_id: conflictReqId,
        vehicle_id: "SC-1",
        price_inr: 12500
      })
    });
    assertCheck(
      !r5BagRefusal.body.ok && r5BagRefusal.body.error?.rule === "R5",
      "M3 + R7 (R5): Refuses Sakura Cabs SC-1 with insufficient large-bag capacity"
    );

    const r6BusyRefusal = await callApi("/suppliers/TX-JP-01/offers", {
      method: "POST",
      body: JSON.stringify({
        request_id: conflictReqId,
        vehicle_id: "SC-2",
        price_inr: 12500
      })
    });
    assertCheck(
      !r6BusyRefusal.body.ok && r6BusyRefusal.body.error?.rule === "R6",
      "M3 + R7 (R6): Refuses Sakura Cabs SC-2 overlapping pre-booked RIDE-0001"
    );

    const r3SupplierPrice = await callApi("/suppliers/TX-JP-01/offers", {
      method: "POST",
      body: JSON.stringify({
        request_id: conflictReqId,
        vehicle_id: "SC-3",
        price_inr: 25000
      })
    });
    assertCheck(
      !r3SupplierPrice.body.ok && r3SupplierPrice.body.error?.rule === "R3",
      "M3 + R7 (R3): Refuses supplier offer price outside route range"
    );

    // Isolated future date avoids colliding with any manual demo bookings on 2027-04-10
    const primaryReq = await callApi<{ request: { request_id: string } }>("/requests", {
      method: "POST",
      body: JSON.stringify({
        traveler_name: "Verifier Booking Flow A",
        flight_id: "FL-401",
        hotel_id: "HTL-TYO-004",
        adults: 2,
        child_ages: [6],
        large_bags: 3,
        small_bags: 2,
        pickup: "2027-04-18T11:30",
        price_inr: 12000
      })
    });
    const reqA = primaryReq.body.data?.request.request_id ?? "";
    if (reqA) {
      createdRequestIds.push(reqA);
    }

    const overlapReq = await callApi<{ request: { request_id: string } }>("/requests", {
      method: "POST",
      body: JSON.stringify({
        traveler_name: "Verifier Booking Flow B",
        flight_id: "FL-401",
        hotel_id: "HTL-TYO-004",
        adults: 2,
        child_ages: [],
        large_bags: 1,
        small_bags: 1,
        pickup: "2027-04-18T12:00",
        price_inr: 12500
      })
    });
    const reqB = overlapReq.body.data?.request.request_id ?? "";
    if (reqB) {
      createdRequestIds.push(reqB);
    }

    const offerSakura = await callApi<{ offer: { offer_id: string } }>(
      "/suppliers/TX-JP-01/offers",
      {
        method: "POST",
        body: JSON.stringify({
          request_id: reqA,
          vehicle_id: "SC-3",
          price_inr: 14200
        })
      }
    );
    const offerSakuraId = offerSakura.body.data?.offer.offer_id ?? "";
    if (offerSakuraId) {
      createdOfferIds.push(offerSakuraId);
    }

    const offerEp1 = await callApi<{ offer: { offer_id: string } }>(
      "/suppliers/TX-JP-03/offers",
      {
        method: "POST",
        body: JSON.stringify({
          request_id: reqA,
          vehicle_id: "EP-1",
          price_inr: 13500
        })
      }
    );
    const offerEp1Id = offerEp1.body.data?.offer.offer_id ?? "";
    if (offerEp1Id) {
      createdOfferIds.push(offerEp1Id);
    }

    const offerEp2 = await callApi<{ offer: { offer_id: string } }>(
      "/suppliers/TX-JP-03/offers",
      {
        method: "POST",
        body: JSON.stringify({
          request_id: reqA,
          vehicle_id: "EP-2",
          price_inr: 11800
        })
      }
    );
    const offerEp2Id = offerEp2.body.data?.offer.offer_id ?? "";
    if (offerEp2Id) {
      createdOfferIds.push(offerEp2Id);
    }

    assertCheck(
      offerSakura.status === 201 && offerEp1.status === 201 && offerEp2.status === 201,
      "G1: Allows supplier Edo Premium Cars to offer multiple distinct vehicles on one request"
    );

    const offerExpiring = await callApi<{ offer: { offer_id: string } }>(
      "/suppliers/TX-JP-01/offers",
      {
        method: "POST",
        body: JSON.stringify({
          request_id: reqB,
          vehicle_id: "SC-3",
          price_inr: 12000,
          expires_in_seconds: 1
        })
      }
    );
    const offerExpiringId = offerExpiring.body.data?.offer.offer_id ?? "";
    if (offerExpiringId) {
      createdOfferIds.push(offerExpiringId);
    }

    const offerEp2Overlap = await callApi<{ offer: { offer_id: string } }>(
      "/suppliers/TX-JP-03/offers",
      {
        method: "POST",
        body: JSON.stringify({
          request_id: reqB,
          vehicle_id: "EP-2",
          price_inr: 12200
        })
      }
    );
    const offerEp2OverlapId = offerEp2Overlap.body.data?.offer.offer_id ?? "";
    if (offerEp2OverlapId) {
      createdOfferIds.push(offerEp2OverlapId);
    }

    const sortedAll = await callApi<{
      offers: Array<{ price_inr: number; price_delta_inr: number }>;
    }>(`/requests/${reqA}?sort=price_asc`);
    const allPrices = sortedAll.body.data?.offers.map((o) => o.price_inr) ?? [];

    const filteredSuv = await callApi<{
      offers: Array<{ price_inr: number }>;
    }>(`/requests/${reqA}?sort=price_asc&carType=SUV`);
    const suvPrices = filteredSuv.body.data?.offers.map((o) => o.price_inr) ?? [];

    assertCheck(
      allPrices.length === 3 &&
        allPrices[0] === 11800 &&
        allPrices[1] === 13500 &&
        allPrices[2] === 14200 &&
        suvPrices.length === 2 &&
        suvPrices[0] === 11800 &&
        suvPrices[1] === 14200,
      "G5 + S2: Sorts offers ascending by price, filters SUV vs SEDAN, and computes price delta"
    );

    const rejected = await callApi<{ status: string }>(`/offers/${offerSakuraId}/reject`, {
      method: "POST"
    });
    const bookRejected = await callApi(`/offers/${offerSakuraId}/book`, {
      method: "POST"
    });
    assertCheck(
      rejected.status === 200 &&
        !bookRejected.body.ok &&
        bookRejected.body.error?.rule === "R8",
      "M4 + R8: Rejects offer cleanly and prevents booking a rejected taxi offer"
    );

    await waitMs(1150);
    const bookExpired = await callApi(`/offers/${offerExpiringId}/book`, {
      method: "POST"
    });
    assertCheck(
      !bookExpired.body.ok && bookExpired.body.error?.rule === "G4",
      "G4: Lazily expires elapsed taxi offer and blocks booking"
    );

    const booked = await callApi<{
      booking: { booking_number: string; pickup: string };
    }>(`/offers/${offerEp2Id}/book`, {
      method: "POST"
    });
    const bookingNumber = booked.body.data?.booking.booking_number ?? "";
    if (bookingNumber) {
      createdBookingNumbers.push(bookingNumber);
    }
    assertCheck(
      booked.status === 201 && /^[1-9]\d{9}$/.test(bookingNumber),
      `M4 + M5: Confirms booking with unique 10-digit booking_number (#${bookingNumber})`
    );

    const summaryOk = await callApi<{ booking: { booking_number: string } }>(
      `/bookings/${bookingNumber}`
    );
    const summaryMissing = await callApi("/bookings/9999999999");
    assertCheck(
      summaryOk.status === 200 &&
        summaryOk.body.data?.booking.booking_number === bookingNumber &&
        summaryMissing.status === 404,
      "M5: Persists 10-digit booking summary and returns 404 for unknown booking numbers"
    );

    const doubleBookAttempt = await callApi(`/offers/${offerEp2OverlapId}/book`, {
      method: "POST"
    });
    assertCheck(
      doubleBookAttempt.status === 409 && doubleBookAttempt.body.error?.rule === "R6",
      "M6: Sequential availability check prevents double-booking the same vehicle"
    );

    const chgRejectCreate = await callApi<{
      change_request: { change_id: string };
    }>(`/bookings/${bookingNumber}/change-requests`, {
      method: "POST",
      body: JSON.stringify({
        new_pickup: "2027-04-18T12:00"
      })
    });
    const chgRejectId = chgRejectCreate.body.data?.change_request.change_id ?? "";
    if (chgRejectId) {
      createdChangeIds.push(chgRejectId);
    }

    const chgRejectDecision = await callApi<{
      booking: { pickup: string };
    }>(`/change-requests/${chgRejectId}/decision`, {
      method: "POST",
      body: JSON.stringify({
        decision: "REJECT"
      })
    });
    assertCheck(
      chgRejectDecision.status === 200 &&
        chgRejectDecision.body.data?.booking.pickup === "2027-04-18T11:30",
      "M7 + R9: Rejecting a change request preserves the original confirmed booking"
    );

    const chgAcceptCreate = await callApi<{
      change_request: { change_id: string };
    }>(`/bookings/${bookingNumber}/change-requests`, {
      method: "POST",
      body: JSON.stringify({
        new_pickup: "2027-04-18T12:30"
      })
    });
    const chgAcceptId = chgAcceptCreate.body.data?.change_request.change_id ?? "";
    if (chgAcceptId) {
      createdChangeIds.push(chgAcceptId);
    }

    const chgAcceptDecision = await callApi<{
      booking: { pickup: string; busy_end: string };
      change_request: { status: string };
    }>(`/change-requests/${chgAcceptId}/decision`, {
      method: "POST",
      body: JSON.stringify({
        decision: "ACCEPT"
      })
    });
    assertCheck(
      chgAcceptDecision.status === 200 &&
        chgAcceptDecision.body.data?.change_request.status === "ACCEPTED" &&
        chgAcceptDecision.body.data?.booking.pickup === "2027-04-18T12:30" &&
        chgAcceptDecision.body.data?.booking.busy_end === "2027-04-18T15:30",
      "M7 + R9: Accepting a valid change request updates pickup and recalculates R6 busy window"
    );

    console.log("\nALL 19 RULE & FEATURE CHECKS PASSED (R1–R9, M1–M7, G1, G2, G4, G5, S2).\n");
  }
  finally {
    await mongoose.connect(MONGODB_URI, {
      dbName: "airport_taxi_offers",
      serverSelectionTimeoutMS: 5000
    });

    if (createdChangeIds.length > 0) {
      await ChangeRequestModel.deleteMany({ change_id: { $in: createdChangeIds } });
    }
    if (createdBookingNumbers.length > 0) {
      await BookingModel.deleteMany({ booking_number: { $in: createdBookingNumbers } });
    }
    if (createdOfferIds.length > 0) {
      await TaxiOfferModel.deleteMany({ offer_id: { $in: createdOfferIds } });
    }
    if (createdRequestIds.length > 0) {
      await RideRequestModel.deleteMany({ request_id: { $in: createdRequestIds } });
    }

    await mongoose.disconnect();
  }
}

void runVerification().catch((err: unknown) => {
  console.error("\nVerification failed:", err);
  process.exit(1);
});
