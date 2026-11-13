import {
  AirportModel,
  BookedRideModel,
  BookingModel,
  FlightModel,
  HotelModel,
  RouteModel,
  TaxiCompanyModel
} from "../models/schemas";
import type {
  CarType,
  IAirport,
  IBookedRide,
  IBooking,
  IFlight,
  IHotel,
  IRoute,
  ITaxiCompany,
  IVehicle
} from "../models/schemas";
import { addMinutesToLocal, isWithinServiceHours, normalizeDateTime } from "../utils/time";

const VALID_CAR_TYPES = new Set<string>(["HATCHBACK", "SEDAN", "SUV", "BUS"]);

export class RuleError extends Error {
  status: number;
  rule: string;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    rule: string,
    code: string,
    message: string,
    status = 422,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "RuleError";
    this.rule = rule;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface ValidatedRouteContext {
  flight: IFlight;
  hotel: IHotel;
  airport: IAirport;
  route: IRoute;
  earliestPickup: string;
}

export interface VehicleFitResult {
  fits: boolean;
  rule?: "R5" | "G2";
  reason?: string;
}

export interface VehicleFreeResult {
  free: boolean;
  conflictSource?: string;
  conflictWindow?: [string, string];
  reason?: string;
}

export interface EvaluatedVehicle {
  vehicle: IVehicle;
  fits: boolean;
  free: boolean;
  eligible: boolean;
  brokenRule?: "R5" | "G2" | "R6";
  reason?: string;
  conflictSource?: string;
  conflictWindow?: [string, string];
}

export interface SupplierEvaluation {
  company: ITaxiCompany;
  servable: boolean;
  worksAtAirport: boolean;
  servesArea: boolean;
  openAtPickup: boolean;
  vehicleEvaluations: EvaluatedVehicle[];
  disqualifyRule?: "R4" | "R5" | "G2" | "R6";
  disqualifyReason?: string;
}

export interface ServabilityReport {
  servableCount: number;
  servableCompanyIds: string[];
  unservableReasons: string[];
  supplierEvaluations: SupplierEvaluation[];
}

export interface RequestCriteria {
  flight_id: string;
  hotel_id: string;
  adults: number;
  child_ages: number[];
  large_bags: number;
  small_bags: number;
  pickup: string;
  car_type: CarType | null;
}

export async function validateFlightAndHotelR1(
  flightId: string,
  hotelId: string
): Promise<ValidatedRouteContext> {
  if (!flightId || !hotelId) {
    throw new RuleError(
      "R1",
      "MISSING_FLIGHT_OR_HOTEL",
      "Rule R1 violated: Both an arrival flight and a destination hotel are required."
    );
  }

  const [flight, hotel] = await Promise.all([
    FlightModel.findOne({ flight_id: flightId }).lean(),
    HotelModel.findOne({ hotel_id: hotelId }).lean()
  ]);

  if (!flight) {
    throw new RuleError(
      "R1",
      "UNKNOWN_FLIGHT",
      `Rule R1 violated: Flight "${flightId}" does not exist in the catalog.`
    );
  }

  if (!hotel) {
    throw new RuleError(
      "R1",
      "UNKNOWN_HOTEL",
      `Rule R1 violated: Hotel "${hotelId}" does not exist in the catalog.`
    );
  }

  const airport = await AirportModel.findOne({ code: flight.to }).lean();
  if (!airport || !airport.serves_cities.includes(hotel.city)) {
    throw new RuleError(
      "R1",
      "AIRPORT_CITY_MISMATCH",
      `Rule R1 violated: Arrival airport ${flight.to} does not serve hotels in ${hotel.city}.`,
      422,
      {
        arrival_airport: flight.to,
        serves_cities: airport?.serves_cities ?? [],
        hotel_city: hotel.city
      }
    );
  }

  const route = await RouteModel.findOne({
    airport: flight.to,
    city: hotel.city,
    area: hotel.area
  }).lean();

  if (!route) {
    throw new RuleError(
      "R1",
      "ROUTE_NOT_FOUND",
      `Rule R1 violated: No route exists from ${flight.to} to ${hotel.city} (${hotel.area}).`
    );
  }

  const earliestPickup = addMinutesToLocal(flight.arrival_local, 60);

  return {
    flight,
    hotel,
    airport,
    route,
    earliestPickup
  };
}

export function validatePassengersAndBagsR1(input: {
  adults: unknown;
  child_ages: unknown;
  large_bags: unknown;
  small_bags: unknown;
  car_type?: unknown;
}): {
  adults: number;
  child_ages: number[];
  large_bags: number;
  small_bags: number;
  car_type: CarType | null;
} {
  const adults = Number(input.adults);
  if (!Number.isInteger(adults) || adults < 1) {
    throw new RuleError(
      "R1",
      "INVALID_ADULTS",
      "Rule R1 violated: At least 1 adult passenger (whole number) is required."
    );
  }

  if (!Array.isArray(input.child_ages)) {
    throw new RuleError(
      "R1",
      "INVALID_CHILD_AGES",
      "Rule R1 violated: child_ages must be a list of ages between 0 and 17."
    );
  }

  const childAges: number[] = [];
  for (const rawAge of input.child_ages) {
    const age = Number(rawAge);
    if (!Number.isInteger(age) || age < 0 || age > 17) {
      throw new RuleError(
        "R1",
        "INVALID_CHILD_AGE_RANGE",
        `Rule R1 violated: Every child age must be a whole number from 0 to 17 (received "${String(rawAge)}").`
      );
    }
    childAges.push(age);
  }

  const largeBags = Number(input.large_bags);
  const smallBags = Number(input.small_bags);
  if (!Number.isInteger(largeBags) || largeBags < 0 || !Number.isInteger(smallBags) || smallBags < 0) {
    throw new RuleError(
      "R1",
      "INVALID_BAGS",
      "Rule R1 violated: Large bags and small bags must be non-negative whole numbers."
    );
  }

  let carType: CarType | null = null;
  if (input.car_type !== undefined && input.car_type !== null && input.car_type !== "") {
    const candidate = String(input.car_type).toUpperCase();
    if (!VALID_CAR_TYPES.has(candidate)) {
      throw new RuleError(
        "G2",
        "INVALID_CAR_TYPE",
        `Car type must be one of HATCHBACK, SEDAN, SUV, or BUS (received "${String(input.car_type)}").`
      );
    }
    carType = candidate as CarType;
  }

  return {
    adults,
    child_ages: childAges,
    large_bags: largeBags,
    small_bags: smallBags,
    car_type: carType
  };
}

export function resolveAndValidatePickupR2(
  arrivalLocal: string,
  requestedPickup?: string | null
): string {
  const earliestPickup = addMinutesToLocal(arrivalLocal, 60);

  if (requestedPickup === undefined || requestedPickup === null || requestedPickup.trim() === "") {
    return earliestPickup;
  }

  const normalized = normalizeDateTime(requestedPickup);
  if (!normalized) {
    throw new RuleError(
      "R2",
      "INVALID_PICKUP_FORMAT",
      "Rule R2 violated: Pickup time must be a valid local date-time (YYYY-MM-DDTHH:MM)."
    );
  }

  if (normalized < earliestPickup) {
    throw new RuleError(
      "R2",
      "PICKUP_TOO_EARLY",
      `Rule R2 violated: Pickup (${normalized}) must be at least 60 minutes after landing (${arrivalLocal}). Earliest allowed pickup is ${earliestPickup}.`,
      422,
      {
        arrival_local: arrivalLocal,
        earliest_pickup: earliestPickup,
        requested_pickup: normalized
      }
    );
  }

  return normalized;
}

export function validatePriceInRangeR3(priceInput: unknown, route: IRoute): number {
  const price = Number(priceInput);
  if (!Number.isInteger(price)) {
    throw new RuleError(
      "R3",
      "INVALID_PRICE_FORMAT",
      `Rule R3 violated: Price must be a whole INR amount between ₹${route.price_min_inr} and ₹${route.price_max_inr}.`,
      422,
      {
        price_min_inr: route.price_min_inr,
        price_max_inr: route.price_max_inr
      }
    );
  }

  if (price < route.price_min_inr || price > route.price_max_inr) {
    throw new RuleError(
      "R3",
      "PRICE_OUT_OF_RANGE",
      `Rule R3 violated: Price ₹${price} is outside the allowed route range of ₹${route.price_min_inr} – ₹${route.price_max_inr} (${route.airport} → ${route.area}).`,
      422,
      {
        price_min_inr: route.price_min_inr,
        price_max_inr: route.price_max_inr,
        submitted_price_inr: price
      }
    );
  }

  return price;
}

export function computeBusyWindowR6(
  pickupLocalHM: string,
  driveMinutes: number
): { busyStart: string; busyEnd: string } {
  const busyStart = pickupLocalHM;
  const busyEnd = addMinutesToLocal(pickupLocalHM, 2 * driveMinutes);
  return {
    busyStart,
    busyEnd
  };
}

export function checkVehicleFitsR5(
  vehicle: IVehicle,
  criteria: Pick<RequestCriteria, "adults" | "child_ages" | "large_bags" | "small_bags" | "car_type">
): VehicleFitResult {
  if (criteria.car_type !== null && vehicle.type !== criteria.car_type) {
    return {
      fits: false,
      rule: "G2",
      reason: `Car ${vehicle.vehicle_id} is ${vehicle.type}, but traveler requested ${criteria.car_type}.`
    };
  }

  const totalPassengers = criteria.adults + criteria.child_ages.length;
  if (vehicle.seats < totalPassengers) {
    return {
      fits: false,
      rule: "R5",
      reason: `Car ${vehicle.vehicle_id} has ${vehicle.seats} seats, fewer than ${totalPassengers} passengers.`
    };
  }

  if (vehicle.large_bags < criteria.large_bags) {
    return {
      fits: false,
      rule: "R5",
      reason: `Car ${vehicle.vehicle_id} fits ${vehicle.large_bags} large bags, fewer than ${criteria.large_bags} required.`
    };
  }

  if (vehicle.small_bags < criteria.small_bags) {
    return {
      fits: false,
      rule: "R5",
      reason: `Car ${vehicle.vehicle_id} fits ${vehicle.small_bags} small bags, fewer than ${criteria.small_bags} required.`
    };
  }

  return {
    fits: true
  };
}

export function checkVehicleFreeInMemory(
  vehicleId: string,
  busyStart: string,
  busyEnd: string,
  bookedRides: IBookedRide[],
  confirmedBookings: IBooking[],
  excludeBookingNumber?: string
): VehicleFreeResult {
  for (const ride of bookedRides) {
    if (ride.vehicle_id === vehicleId && ride.start < busyEnd && ride.end > busyStart) {
      return {
        free: false,
        conflictSource: ride.ride_id,
        conflictWindow: [ride.start, ride.end],
        reason: `Car ${vehicleId} is busy ${ride.start}–${ride.end} (${ride.ride_id}).`
      };
    }
  }

  for (const booking of confirmedBookings) {
    if (excludeBookingNumber && booking.booking_number === excludeBookingNumber) {
      continue;
    }
    if (
      booking.vehicle_id === vehicleId &&
      booking.busy_start < busyEnd &&
      booking.busy_end > busyStart
    ) {
      return {
        free: false,
        conflictSource: `Booking #${booking.booking_number}`,
        conflictWindow: [booking.busy_start, booking.busy_end],
        reason: `Car ${vehicleId} is already booked ${booking.busy_start}–${booking.busy_end} (Booking #${booking.booking_number}).`
      };
    }
  }

  return {
    free: true
  };
}

export async function checkVehicleFreeR6(
  vehicleId: string,
  busyStart: string,
  busyEnd: string,
  excludeBookingNumber?: string
): Promise<VehicleFreeResult> {
  const [bookedRides, confirmedBookings] = await Promise.all([
    BookedRideModel.find({
      vehicle_id: vehicleId,
      start: { $lt: busyEnd },
      end: { $gt: busyStart }
    }).lean(),
    BookingModel.find({
      vehicle_id: vehicleId,
      busy_start: { $lt: busyEnd },
      busy_end: { $gt: busyStart }
    }).lean()
  ]);

  return checkVehicleFreeInMemory(
    vehicleId,
    busyStart,
    busyEnd,
    bookedRides,
    confirmedBookings,
    excludeBookingNumber
  );
}

export function evaluateSuppliersInMemory(
  criteria: RequestCriteria,
  flight: IFlight,
  hotel: IHotel,
  route: IRoute,
  companies: ITaxiCompany[],
  bookedRides: IBookedRide[],
  confirmedBookings: IBooking[]
): ServabilityReport {
  const { busyStart, busyEnd } = computeBusyWindowR6(criteria.pickup, route.drive_minutes);
  const supplierEvaluations: SupplierEvaluation[] = [];
  const servableCompanyIds: string[] = [];
  const airportSupplierNotes: string[] = [];

  for (const company of companies) {
    const worksAtAirport = company.airports.includes(flight.to);
    const servesArea = company.areas.some(
      (zone) => zone.city === hotel.city && zone.area === hotel.area
    );
    const openAtPickup = isWithinServiceHours(
      criteria.pickup,
      company.service_from,
      company.service_until
    );

    const vehicleEvaluations: EvaluatedVehicle[] = company.vehicles.map((vehicle) => {
      const fitCheck = checkVehicleFitsR5(vehicle, criteria);
      const freeCheck = checkVehicleFreeInMemory(
        vehicle.vehicle_id,
        busyStart,
        busyEnd,
        bookedRides,
        confirmedBookings
      );

      if (!fitCheck.fits) {
        return {
          vehicle,
          fits: false,
          free: freeCheck.free,
          eligible: false,
          brokenRule: fitCheck.rule,
          reason: fitCheck.reason,
          conflictSource: freeCheck.conflictSource,
          conflictWindow: freeCheck.conflictWindow
        };
      }

      if (!freeCheck.free) {
        return {
          vehicle,
          fits: true,
          free: false,
          eligible: false,
          brokenRule: "R6",
          reason: freeCheck.reason,
          conflictSource: freeCheck.conflictSource,
          conflictWindow: freeCheck.conflictWindow
        };
      }

      return {
        vehicle,
        fits: true,
        free: true,
        eligible: true
      };
    });

    if (!worksAtAirport) {
      supplierEvaluations.push({
        company,
        servable: false,
        worksAtAirport,
        servesArea,
        openAtPickup,
        vehicleEvaluations,
        disqualifyRule: "R4",
        disqualifyReason: `${company.name} does not operate at ${flight.to}.`
      });
      continue;
    }

    if (!servesArea) {
      const reason = `${company.name}: operates at ${flight.to}, but does not drive to ${hotel.city} (${hotel.area}).`;
      airportSupplierNotes.push(reason);
      supplierEvaluations.push({
        company,
        servable: false,
        worksAtAirport,
        servesArea,
        openAtPickup,
        vehicleEvaluations,
        disqualifyRule: "R4",
        disqualifyReason: reason
      });
      continue;
    }

    if (!openAtPickup) {
      const pickupHHMM = criteria.pickup.slice(11, 16);
      const reason = `${company.name}: closed at pickup time ${pickupHHMM} (hours ${company.service_from}–${company.service_until}).`;
      airportSupplierNotes.push(reason);
      supplierEvaluations.push({
        company,
        servable: false,
        worksAtAirport,
        servesArea,
        openAtPickup,
        vehicleEvaluations,
        disqualifyRule: "R4",
        disqualifyReason: reason
      });
      continue;
    }

    const hasEligibleCar = vehicleEvaluations.some((v) => v.eligible);
    if (!hasEligibleCar) {
      const fittingCars = vehicleEvaluations.filter((v) => v.fits);
      let reason: string;
      let brokenRule: "R5" | "G2" | "R6" = "R5";

      if (fittingCars.length > 0) {
        brokenRule = "R6";
        const busyDetails = fittingCars.map((v) => v.reason).join(" ");
        reason = `${company.name}: all fitting vehicles are busy during ${busyStart}–${busyEnd}. ${busyDetails}`;
      }
      else if (
        criteria.car_type !== null &&
        !company.vehicles.some((v) => v.type === criteria.car_type)
      ) {
        brokenRule = "G2";
        const fleetTypes = Array.from(new Set(company.vehicles.map((v) => v.type))).join(", ");
        reason = `${company.name}: has no ${criteria.car_type} in its fleet (has: ${fleetTypes}).`;
      }
      else {
        const totalPax = criteria.adults + criteria.child_ages.length;
        reason = `${company.name}: no vehicle fits ${totalPax} passengers with ${criteria.large_bags} large + ${criteria.small_bags} small bags${criteria.car_type ? ` (${criteria.car_type})` : ""}.`;
      }

      airportSupplierNotes.push(reason);
      supplierEvaluations.push({
        company,
        servable: false,
        worksAtAirport,
        servesArea,
        openAtPickup,
        vehicleEvaluations,
        disqualifyRule: brokenRule,
        disqualifyReason: reason
      });
      continue;
    }

    servableCompanyIds.push(company.company_id);
    supplierEvaluations.push({
      company,
      servable: true,
      worksAtAirport,
      servesArea,
      openAtPickup,
      vehicleEvaluations
    });
  }

  const unservableReasons =
    servableCompanyIds.length > 0
      ? []
      : airportSupplierNotes.length > 0
        ? airportSupplierNotes
        : [`No taxi supplier operates at arrival airport ${flight.to}.`];

  return {
    servableCount: servableCompanyIds.length,
    servableCompanyIds,
    unservableReasons,
    supplierEvaluations
  };
}

export async function evaluateSuppliersForRequestR4(
  criteria: RequestCriteria
): Promise<ServabilityReport> {
  const { flight, hotel, route } = await validateFlightAndHotelR1(
    criteria.flight_id,
    criteria.hotel_id
  );
  const [companies, bookedRides, confirmedBookings] = await Promise.all([
    TaxiCompanyModel.find({}).sort({ company_id: 1 }).lean(),
    BookedRideModel.find({}).lean(),
    BookingModel.find({ status: "CONFIRMED" }).lean()
  ]);

  return evaluateSuppliersInMemory(
    criteria,
    flight,
    hotel,
    route,
    companies,
    bookedRides,
    confirmedBookings
  );
}
