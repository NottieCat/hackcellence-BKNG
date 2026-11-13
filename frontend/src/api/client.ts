export type CarType = "HATCHBACK" | "SEDAN" | "SUV" | "BUS";
export type RequestStatus = "OPEN" | "BOOKED";
export type OfferStatus = "OPEN" | "BOOKED" | "REJECTED" | "NOT_CHOSEN" | "EXPIRED";

export interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  serves_cities?: string[];
}

export interface Flight {
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

export interface Hotel {
  hotel_id: string;
  name: string;
  city: string;
  area: string;
  stars: number;
  rating: number;
}

export interface RouteInfo {
  airport: string;
  city: string;
  area: string;
  distance_km: number;
  drive_minutes: number;
  price_min_inr: number;
  price_max_inr: number;
}

export interface Vehicle {
  vehicle_id: string;
  type: CarType;
  seats: number;
  large_bags: number;
  small_bags: number;
}

export interface SupplierCompany {
  company_id: string;
  name: string;
  airports: string[];
  areas: Array<{ city: string; area: string }>;
  service_from: string;
  service_until: string;
  rating: number;
  vehicles: Vehicle[];
  servable_open_count?: number;
  pending_changes_count?: number;
}

export interface BootstrapData {
  airports: Airport[];
  flights: Flight[];
  hotels: Hotel[];
  routes: RouteInfo[];
  suppliers: SupplierCompany[];
}

export interface HealthData {
  status: string;
  mongoConnected: boolean;
  database: string;
  dataDirectoryReady: boolean;
}

export interface RouteQuoteData {
  flight: Flight;
  hotel: Hotel;
  airport: Airport;
  route: RouteInfo;
  earliest_pickup: string;
  price_min_inr: number;
  price_max_inr: number;
  drive_minutes: number;
  distance_km: number;
}

export interface ServabilityInfo {
  servable_count: number;
  servable_company_ids: string[];
  unservable_reasons: string[];
}

export interface EnrichedRideRequest {
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
  created_at: string;
  flight: Flight | null;
  hotel: Hotel | null;
  route: RouteInfo | null;
  busy_window: { start: string; end: string } | null;
  open_offers_count: number;
  total_offers_count: number;
  booking_number: string | null;
  servability: ServabilityInfo;
}

export interface CreateRideRequestInput {
  traveler_name: string;
  flight_id: string;
  hotel_id: string;
  adults: number;
  child_ages: number[];
  large_bags: number;
  small_bags: number;
  pickup?: string;
  car_type?: string | null;
  price_inr: number;
}

export interface CreatedRideRequestResponse {
  request: {
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
  };
  flight: Flight;
  hotel: Hotel;
  route: RouteInfo;
  busy_window: { start: string; end: string };
  servability: ServabilityInfo;
}

export interface EnrichedTaxiOffer {
  offer_id: string;
  request_id: string;
  company_id: string;
  company_name: string;
  company_rating: number | null;
  vehicle_id: string;
  vehicle: Vehicle | null;
  price_inr: number;
  price_delta_inr: number;
  expires_at: string | null;
  status: OfferStatus;
  car_currently_free: boolean;
  conflict_reason: string | null;
  created_at: string;
}

export interface RequestDetailData {
  request: {
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
  };
  flight: Flight;
  hotel: Hotel;
  route: RouteInfo;
  busy_window: { start: string; end: string };
  booking: {
    booking_number: string;
    company_id: string;
    vehicle_id: string;
    price_inr: number;
    pickup: string;
  } | null;
  servability: ServabilityInfo;
  offers: EnrichedTaxiOffer[];
}

export interface RuleErrorPayload {
  rule?: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiRuleError extends Error {
  status: number;
  rule?: string;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, payload: RuleErrorPayload) {
    super(payload.message);
    this.name = "ApiRuleError";
    this.status = status;
    this.rule = payload.rule;
    this.code = payload.code;
    this.details = payload.details;
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  const response = await fetch(path, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers as Record<string, string> | undefined)
    }
  });

  let json: unknown = null;
  try {
    json = await response.json();
  }
  catch {
    throw new ApiRuleError(response.status, {
      code: "NON_JSON_RESPONSE",
      message: `Backend endpoint ${path} returned HTTP ${response.status} without JSON.`
    });
  }

  const envelope = json as {
    ok?: boolean;
    data?: T;
    error?: RuleErrorPayload;
  };

  if (!response.ok || envelope.ok === false) {
    const fallbackError: RuleErrorPayload = {
      code: "REQUEST_FAILED",
      message: `Request failed with status ${response.status}`
    };
    throw new ApiRuleError(response.status, envelope.error ?? fallbackError);
  }

  return envelope.data as T;
}

export function fetchHealth(): Promise<HealthData> {
  return apiRequest<HealthData>("/api/health");
}

export function fetchBootstrap(): Promise<BootstrapData> {
  return apiRequest<BootstrapData>("/api/catalog/bootstrap");
}

export function fetchRouteQuote(flightId: string, hotelId: string): Promise<RouteQuoteData> {
  const params = new URLSearchParams({
    flightId,
    hotelId
  });
  return apiRequest<RouteQuoteData>(`/api/routes/quote?${params.toString()}`);
}

export function fetchRideRequests(): Promise<{ requests: EnrichedRideRequest[] }> {
  return apiRequest<{ requests: EnrichedRideRequest[] }>("/api/requests");
}

export function createRideRequest(
  payload: CreateRideRequestInput
): Promise<CreatedRideRequestResponse> {
  return apiRequest<CreatedRideRequestResponse>("/api/requests", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function fetchRequestDetail(
  requestId: string,
  options?: { sort?: string; carType?: string }
): Promise<RequestDetailData> {
  const params = new URLSearchParams();
  if (options?.sort) {
    params.set("sort", options.sort);
  }
  if (options?.carType) {
    params.set("carType", options.carType);
  }
  const qs = params.toString();
  const suffix = qs ? `?${qs}` : "";
  return apiRequest<RequestDetailData>(`/api/requests/${encodeURIComponent(requestId)}${suffix}`);
}
