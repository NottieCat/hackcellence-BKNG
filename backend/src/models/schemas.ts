import mongoose, { Schema } from "mongoose";

export type CarType = "HATCHBACK" | "SEDAN" | "SUV" | "BUS";
export type RequestStatus = "OPEN" | "BOOKED";
export type OfferStatus = "OPEN" | "BOOKED" | "REJECTED" | "NOT_CHOSEN" | "EXPIRED";
export type ChangeStatus = "PENDING" | "ACCEPTED" | "REJECTED";

export interface IAirport {
  code: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  lat?: number;
  lng?: number;
  serves_cities: string[];
}

export interface IFlight {
  flight_id: string;
  airline: string;
  flight_number: string;
  from: string;
  to: string;
  departure_local: string;
  arrival_local: string;
  stops: number;
  duration_minutes: number;
  cabin: string;
}

export interface IHotel {
  hotel_id: string;
  name: string;
  aliases: string[];
  city: string;
  area: string;
  lat?: number;
  lng?: number;
  rating: number;
  stars: number;
  check_in_from?: string;
  check_out_until?: string;
  family_friendly?: boolean;
}

export interface IRoute {
  airport: string;
  city: string;
  area: string;
  distance_km: number;
  drive_minutes: number;
  price_min_inr: number;
  price_max_inr: number;
}

export interface IVehicle {
  vehicle_id: string;
  type: CarType;
  seats: number;
  large_bags: number;
  small_bags: number;
}

export interface IServiceArea {
  city: string;
  area: string;
}

export interface ITaxiCompany {
  company_id: string;
  name: string;
  airports: string[];
  areas: IServiceArea[];
  service_from: string;
  service_until: string;
  rating: number;
  vehicles: IVehicle[];
}

export interface IBookedRide {
  ride_id: string;
  company_id: string;
  vehicle_id: string;
  start: string;
  end: string;
}

export interface IRideRequest {
  request_id: string;
  traveler_name: string;
  flight_id: string;
  hotel_id: string;
  adults: number;
  child_ages: number[];
  large_bags: number;
  small_bags: number;
  pickup: string;
  car_type: CarType | null;
  price_inr: number;
  status: RequestStatus;
  created_at: Date;
}

export interface ITaxiOffer {
  offer_id: string;
  request_id: string;
  company_id: string;
  vehicle_id: string;
  price_inr: number;
  expires_at: Date | null;
  status: OfferStatus;
  created_at: Date;
}

export interface IBooking {
  booking_number: string;
  request_id: string;
  offer_id: string;
  company_id: string;
  vehicle_id: string;
  flight_id: string;
  hotel_id: string;
  pickup: string;
  busy_start: string;
  busy_end: string;
  price_inr: number;
  status: "CONFIRMED";
  created_at: Date;
}

export interface IChangeRequest {
  change_id: string;
  booking_number: string;
  company_id: string;
  prev_flight_id: string;
  prev_pickup: string;
  new_flight_id: string;
  new_pickup: string;
  new_busy_start: string;
  new_busy_end: string;
  status: ChangeStatus;
  decision_reason: string | null;
  created_at: Date;
}

const airportSchema = new Schema<IAirport>(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    city: { type: String, required: true },
    country: { type: String, required: true },
    timezone: { type: String, required: true },
    lat: { type: Number },
    lng: { type: Number },
    serves_cities: { type: [String], default: [] }
  },
  { versionKey: false }
);

const flightSchema = new Schema<IFlight>(
  {
    flight_id: { type: String, required: true, unique: true },
    airline: { type: String, required: true },
    flight_number: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true, index: true },
    departure_local: { type: String, required: true },
    arrival_local: { type: String, required: true },
    stops: { type: Number, default: 0 },
    duration_minutes: { type: Number, required: true },
    cabin: { type: String, default: "ECONOMY" }
  },
  { versionKey: false }
);

const hotelSchema = new Schema<IHotel>(
  {
    hotel_id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    aliases: { type: [String], default: [] },
    city: { type: String, required: true, index: true },
    area: { type: String, required: true },
    lat: { type: Number },
    lng: { type: Number },
    rating: { type: Number, required: true },
    stars: { type: Number, required: true },
    check_in_from: { type: String },
    check_out_until: { type: String },
    family_friendly: { type: Boolean }
  },
  { versionKey: false }
);

const routeSchema = new Schema<IRoute>(
  {
    airport: { type: String, required: true },
    city: { type: String, required: true },
    area: { type: String, required: true },
    distance_km: { type: Number, required: true },
    drive_minutes: { type: Number, required: true },
    price_min_inr: { type: Number, required: true },
    price_max_inr: { type: Number, required: true }
  },
  { versionKey: false }
);

routeSchema.index({ airport: 1, city: 1, area: 1 }, { unique: true });

const serviceAreaSchema = new Schema<IServiceArea>(
  {
    city: { type: String, required: true },
    area: { type: String, required: true }
  },
  { _id: false }
);

const vehicleSchema = new Schema<IVehicle>(
  {
    vehicle_id: { type: String, required: true },
    type: { type: String, enum: ["HATCHBACK", "SEDAN", "SUV", "BUS"], required: true },
    seats: { type: Number, required: true },
    large_bags: { type: Number, required: true },
    small_bags: { type: Number, required: true }
  },
  { _id: false }
);

const taxiCompanySchema = new Schema<ITaxiCompany>(
  {
    company_id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    airports: { type: [String], required: true, index: true },
    areas: { type: [serviceAreaSchema], required: true },
    service_from: { type: String, required: true },
    service_until: { type: String, required: true },
    rating: { type: Number, required: true },
    vehicles: { type: [vehicleSchema], required: true }
  },
  { versionKey: false }
);

const bookedRideSchema = new Schema<IBookedRide>(
  {
    ride_id: { type: String, required: true, unique: true },
    company_id: { type: String, required: true },
    vehicle_id: { type: String, required: true, index: true },
    start: { type: String, required: true },
    end: { type: String, required: true }
  },
  { versionKey: false }
);

const rideRequestSchema = new Schema<IRideRequest>(
  {
    request_id: { type: String, required: true, unique: true },
    traveler_name: { type: String, default: "Traveler" },
    flight_id: { type: String, required: true },
    hotel_id: { type: String, required: true },
    adults: { type: Number, required: true },
    child_ages: { type: [Number], default: [] },
    large_bags: { type: Number, required: true },
    small_bags: { type: Number, required: true },
    pickup: { type: String, required: true },
    car_type: { type: String, enum: ["HATCHBACK", "SEDAN", "SUV", "BUS", null], default: null },
    price_inr: { type: Number, required: true },
    status: { type: String, enum: ["OPEN", "BOOKED"], default: "OPEN", index: true },
    created_at: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

const taxiOfferSchema = new Schema<ITaxiOffer>(
  {
    offer_id: { type: String, required: true, unique: true },
    request_id: { type: String, required: true, index: true },
    company_id: { type: String, required: true, index: true },
    vehicle_id: { type: String, required: true },
    price_inr: { type: Number, required: true },
    expires_at: { type: Date, default: null },
    status: {
      type: String,
      enum: ["OPEN", "BOOKED", "REJECTED", "NOT_CHOSEN", "EXPIRED"],
      default: "OPEN"
    },
    created_at: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

const bookingSchema = new Schema<IBooking>(
  {
    booking_number: { type: String, required: true, unique: true },
    request_id: { type: String, required: true, unique: true },
    offer_id: { type: String, required: true, unique: true },
    company_id: { type: String, required: true, index: true },
    vehicle_id: { type: String, required: true, index: true },
    flight_id: { type: String, required: true },
    hotel_id: { type: String, required: true },
    pickup: { type: String, required: true },
    busy_start: { type: String, required: true },
    busy_end: { type: String, required: true },
    price_inr: { type: Number, required: true },
    status: { type: String, enum: ["CONFIRMED"], default: "CONFIRMED" },
    created_at: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

const changeRequestSchema = new Schema<IChangeRequest>(
  {
    change_id: { type: String, required: true, unique: true },
    booking_number: { type: String, required: true, index: true },
    company_id: { type: String, required: true, index: true },
    prev_flight_id: { type: String, required: true },
    prev_pickup: { type: String, required: true },
    new_flight_id: { type: String, required: true },
    new_pickup: { type: String, required: true },
    new_busy_start: { type: String, required: true },
    new_busy_end: { type: String, required: true },
    status: { type: String, enum: ["PENDING", "ACCEPTED", "REJECTED"], default: "PENDING" },
    decision_reason: { type: String, default: null },
    created_at: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

export const AirportModel = mongoose.model<IAirport>("Airport", airportSchema, "airports");
export const FlightModel = mongoose.model<IFlight>("Flight", flightSchema, "flights");
export const HotelModel = mongoose.model<IHotel>("Hotel", hotelSchema, "hotels");
export const RouteModel = mongoose.model<IRoute>("Route", routeSchema, "routes");
export const TaxiCompanyModel = mongoose.model<ITaxiCompany>("TaxiCompany", taxiCompanySchema, "taxi_companies");
export const BookedRideModel = mongoose.model<IBookedRide>("BookedRide", bookedRideSchema, "booked_rides");
export const RideRequestModel = mongoose.model<IRideRequest>("RideRequest", rideRequestSchema, "ride_requests");
export const TaxiOfferModel = mongoose.model<ITaxiOffer>("TaxiOffer", taxiOfferSchema, "taxi_offers");
export const BookingModel = mongoose.model<IBooking>("Booking", bookingSchema, "bookings");
export const ChangeRequestModel = mongoose.model<IChangeRequest>("ChangeRequest", changeRequestSchema, "change_requests");
