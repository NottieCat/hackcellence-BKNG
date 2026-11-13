export type CarType = "HATCHBACK" | "SEDAN" | "SUV" | "BUS";

export type ActiveView = "traveler" | "supplier" | "booking";

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
