import fs from "node:fs";
import path from "node:path";
import {
  AirportModel,
  BookedRideModel,
  FlightModel,
  HotelModel,
  RideRequestModel,
  RouteModel,
  TaxiCompanyModel
} from "../models/schemas";
import type {
  IAirport,
  IBookedRide,
  IFlight,
  IHotel,
  IRoute,
  ITaxiCompany,
  CarType
} from "../models/schemas";

interface RawOpenRequest {
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
}

export interface SeedSummary {
  airports: number;
  flights: number;
  hotels: number;
  routes: number;
  taxiCompanies: number;
  bookedRides: number;
  openRequests: number;
}

function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function toMinuteTimestamp(dateTimeStr: string): string {
  return dateTimeStr.trim().slice(0, 16);
}

export async function seedDatabase(dataDir: string): Promise<SeedSummary> {
  const airportsRaw = readJsonFile<Array<Partial<IAirport> & { code: string }>>(
    path.join(dataDir, "catalog", "airports.json")
  );
  const flightsRaw = readJsonFile<IFlight[]>(
    path.join(dataDir, "catalog", "flights.json")
  );
  const hotelsRaw = readJsonFile<IHotel[]>(
    path.join(dataDir, "catalog", "hotels.json")
  );
  const routesRaw = readJsonFile<IRoute[]>(
    path.join(dataDir, "problem-2", "routes.json")
  );
  const companiesRaw = readJsonFile<ITaxiCompany[]>(
    path.join(dataDir, "problem-2", "taxi_companies.json")
  );
  const bookedRidesRaw = readJsonFile<IBookedRide[]>(
    path.join(dataDir, "problem-2", "booked_rides.json")
  );
  const openRequestsRaw = readJsonFile<RawOpenRequest[]>(
    path.join(dataDir, "problem-2", "open_requests.json")
  );

  await AirportModel.bulkWrite(
    airportsRaw.map((airport) => ({
      updateOne: {
        filter: { code: airport.code },
        update: {
          $set: {
            code: airport.code,
            name: airport.name ?? "",
            city: airport.city ?? "",
            country: airport.country ?? "",
            timezone: airport.timezone ?? "",
            lat: airport.lat,
            lng: airport.lng,
            serves_cities: airport.serves_cities ?? []
          }
        },
        upsert: true
      }
    }))
  );

  await FlightModel.bulkWrite(
    flightsRaw.map((flight) => ({
      updateOne: {
        filter: { flight_id: flight.flight_id },
        update: {
          $set: {
            flight_id: flight.flight_id,
            airline: flight.airline,
            flight_number: flight.flight_number,
            from: flight.from,
            to: flight.to,
            departure_local: toMinuteTimestamp(flight.departure_local),
            arrival_local: toMinuteTimestamp(flight.arrival_local),
            stops: flight.stops,
            duration_minutes: flight.duration_minutes,
            cabin: flight.cabin
          }
        },
        upsert: true
      }
    }))
  );

  await HotelModel.bulkWrite(
    hotelsRaw.map((hotel) => ({
      updateOne: {
        filter: { hotel_id: hotel.hotel_id },
        update: {
          $set: {
            hotel_id: hotel.hotel_id,
            name: hotel.name,
            aliases: hotel.aliases ?? [],
            city: hotel.city,
            area: hotel.area,
            lat: hotel.lat,
            lng: hotel.lng,
            rating: hotel.rating,
            stars: hotel.stars,
            check_in_from: hotel.check_in_from,
            check_out_until: hotel.check_out_until,
            family_friendly: hotel.family_friendly
          }
        },
        upsert: true
      }
    }))
  );

  await RouteModel.bulkWrite(
    routesRaw.map((route) => ({
      updateOne: {
        filter: {
          airport: route.airport,
          city: route.city,
          area: route.area
        },
        update: { $set: route },
        upsert: true
      }
    }))
  );

  await TaxiCompanyModel.bulkWrite(
    companiesRaw.map((company) => ({
      updateOne: {
        filter: { company_id: company.company_id },
        update: { $set: company },
        upsert: true
      }
    }))
  );

  await BookedRideModel.bulkWrite(
    bookedRidesRaw.map((ride) => ({
      updateOne: {
        filter: { ride_id: ride.ride_id },
        update: {
          $setOnInsert: {
            ride_id: ride.ride_id,
            company_id: ride.company_id,
            vehicle_id: ride.vehicle_id,
            start: toMinuteTimestamp(ride.start),
            end: toMinuteTimestamp(ride.end)
          }
        },
        upsert: true
      }
    }))
  );

  // Use $setOnInsert so a backend restart never resets an already-booked preloaded request back to OPEN
  await RideRequestModel.bulkWrite(
    openRequestsRaw.map((req) => ({
      updateOne: {
        filter: { request_id: req.request_id },
        update: {
          $setOnInsert: {
            request_id: req.request_id,
            traveler_name: req.traveler_name,
            flight_id: req.flight_id,
            hotel_id: req.hotel_id,
            adults: req.adults,
            child_ages: req.child_ages,
            large_bags: req.large_bags,
            small_bags: req.small_bags,
            pickup: toMinuteTimestamp(req.pickup),
            car_type: req.car_type ?? null,
            price_inr: req.price_inr,
            status: "OPEN",
            created_at: new Date()
          }
        },
        upsert: true
      }
    }))
  );

  return {
    airports: airportsRaw.length,
    flights: flightsRaw.length,
    hotels: hotelsRaw.length,
    routes: routesRaw.length,
    taxiCompanies: companiesRaw.length,
    bookedRides: bookedRidesRaw.length,
    openRequests: openRequestsRaw.length
  };
}
