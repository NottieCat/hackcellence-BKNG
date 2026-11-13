import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  CarTaxiFront,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Luggage,
  MapPin,
  PlaneLanding,
  RefreshCw,
  SearchX,
  Star,
  Users
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiRuleError,
  createChangeRequest,
  fetchBookingSummary
} from "../api/client";
import type {
  BookingSummaryData,
  BootstrapData,
  ChangeStatus
} from "../api/client";

interface BookingSummaryPageProps {
  bookingNumber: string;
  bootstrap: BootstrapData | null;
  onBackToTraveler: () => void;
  onOpenSupplier?: (companyId: string) => void;
}

interface FormError {
  rule?: string;
  code?: string;
  message: string;
}

function formatDateTimeLabel(isoHM: string): string {
  if (!isoHM || isoHM.length < 16) {
    return isoHM;
  }
  return `${isoHM.slice(0, 10)} · ${isoHM.slice(11, 16)}`;
}

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function addSixtyMinutesLocal(isoHM: string): string {
  if (!isoHM || isoHM.length < 16) {
    return "";
  }
  const year = Number(isoHM.slice(0, 4));
  const month = Number(isoHM.slice(5, 7));
  const day = Number(isoHM.slice(8, 10));
  const hour = Number(isoHM.slice(11, 13));
  const minute = Number(isoHM.slice(14, 16));
  const dt = new Date(Date.UTC(year, month - 1, day, hour, minute) + 60 * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`;
}

function getChangeBadgeClass(status: ChangeStatus): string {
  if (status === "ACCEPTED") {
    return "ui-badge ui-badge-booked";
  }
  if (status === "REJECTED") {
    return "ui-badge ui-badge-rejected";
  }
  return "ui-badge ui-badge-pending";
}

export function BookingSummaryPage({
  bookingNumber,
  bootstrap,
  onBackToTraveler,
  onOpenSupplier
}: BookingSummaryPageProps) {
  const [summary, setSummary] = useState<BookingSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [notFoundMessage, setNotFoundMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const [newFlightId, setNewFlightId] = useState<string>("");
  const [newPickup, setNewPickup] = useState<string>("");
  const [isSubmittingChange, setIsSubmittingChange] = useState<boolean>(false);
  const [changeError, setChangeError] = useState<FormError | null>(null);
  const [changeSuccess, setChangeSuccess] = useState<string | null>(null);
  const [changeWarning, setChangeWarning] = useState<string | null>(null);

  const loadSummary = useCallback(
    async (silent = false) => {
      if (!bookingNumber.trim()) {
        return;
      }

      if (!silent) {
        setIsLoading(true);
      }
      setNotFoundMessage(null);
      setLoadError(null);

      try {
        const data = await fetchBookingSummary(bookingNumber);
        setSummary(data);
        setNewFlightId((prev) => prev || data.booking.flight_id);
      }
      catch (err) {
        setSummary(null);
        if (err instanceof ApiRuleError && err.status === 404) {
          setNotFoundMessage(err.message || "Booking not found.");
        }
        else if (err instanceof ApiRuleError) {
          setLoadError(err.message);
        }
        else {
          setLoadError("Unable to load booking summary from backend.");
        }
      }
      finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [bookingNumber]
  );

  useEffect(() => {
    setSummary(null);
    setNewFlightId("");
    setNewPickup("");
    setChangeError(null);
    setChangeSuccess(null);
    setChangeWarning(null);
    void loadSummary(false);
  }, [loadSummary]);

  const hasPendingChange = Boolean(
    summary?.change_requests.some((chg) => chg.status === "PENDING")
  );

  useEffect(() => {
    if (!hasPendingChange) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadSummary(true);
    }, 3500);

    return () => {
      window.clearInterval(timer);
    };
  }, [hasPendingChange, loadSummary]);

  const allFlights = bootstrap?.flights ?? [];

  const flightsGrouped = useMemo(() => {
    const hotelCity = summary?.hotel?.city;
    const airports = bootstrap?.airports ?? [];
    const matchingAirports = new Set(
      airports
        .filter((a) => (hotelCity ? a.serves_cities?.includes(hotelCity) : false))
        .map((a) => a.code)
    );

    const sameCityFlights = allFlights.filter((f) => matchingAirports.has(f.to));
    const otherFlights = allFlights.filter((f) => !matchingAirports.has(f.to));
    return {
      sameCityFlights,
      otherFlights
    };
  }, [allFlights, bootstrap?.airports, summary?.hotel?.city]);

  const selectedNewFlight = useMemo(
    () => allFlights.find((f) => f.flight_id === newFlightId) ?? summary?.flight ?? null,
    [allFlights, newFlightId, summary?.flight]
  );

  const earliestNewPickup = selectedNewFlight
    ? addSixtyMinutesLocal(selectedNewFlight.arrival_local)
    : "";

  async function handleCopyBookingNumber(): Promise<void> {
    if (!summary) {
      return;
    }
    try {
      await navigator.clipboard.writeText(summary.booking.booking_number);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
    catch {
      setCopied(false);
    }
  }

  async function handleSubmitChangeRequest(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    if (!summary) {
      return;
    }

    setIsSubmittingChange(true);
    setChangeError(null);
    setChangeSuccess(null);
    setChangeWarning(null);

    try {
      const response = await createChangeRequest(summary.booking.booking_number, {
        new_flight_id: newFlightId || undefined,
        new_pickup: newPickup.trim() || undefined
      });

      setChangeSuccess(
        `Change request ${response.change_request.change_id} sent to ${summary.company?.name ?? summary.booking.company_id} for approval.`
      );

      if (!response.feasibility_preview.car_free_at_new_time) {
        setChangeWarning(
          `Heads up: ${response.feasibility_preview.conflict_reason ?? "The assigned car is currently busy at the requested time"} (supplier acceptance will be blocked by Rule R9 / R6).`
        );
      }
      else if (
        !response.feasibility_preview.supplier_serves_new_airport ||
        !response.feasibility_preview.supplier_open_at_new_pickup
      ) {
        setChangeWarning(
          "Heads up: The new flight airport or pickup hour falls outside this supplier's coverage/hours (Rule R9 / R4)."
        );
      }

      setNewPickup("");
      await loadSummary(true);
    }
    catch (err) {
      if (err instanceof ApiRuleError) {
        setChangeError({
          rule: err.rule,
          code: err.code,
          message: err.message
        });
      }
      else {
        setChangeError({
          code: "NETWORK_ERROR",
          message: "Could not submit flight/pickup change request."
        });
      }
    }
    finally {
      setIsSubmittingChange(false);
    }
  }

  return (
    <section className="panel-enter space-y-8">
      <div className="ui-card ui-top-indigo flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 ui-icon-circle ui-icon-indigo border border-[#C7D2FE] mt-0.5">
            <CarTaxiFront className="h-6 w-6 stroke-[1.8]" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#4F46E5] mb-1">
              Ride Confirmation · M5 &amp; M7
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A]">
              Booking <span className="font-mono text-[#4F46E5]">#{bookingNumber}</span>
            </h1>
            <p className="text-base text-[#64748B] mt-1">
              Persistent 10-digit booking summary and post-booking flight or pickup change requests.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onBackToTraveler}
            className="ui-btn-secondary ui-focus px-4 text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Traveler Portal</span>
          </button>

          <button
            type="button"
            onClick={() => void loadSummary(false)}
            className="ui-btn-secondary ui-focus px-4 text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin text-[#4F46E5]" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {isLoading && !summary && !notFoundMessage && (
        <div className="ui-card space-y-4">
          <div className="h-6 w-56 skeleton-bar" />
          <div className="h-4 w-80 skeleton-bar" />
          <div className="h-28 w-full skeleton-bar" />
        </div>
      )}

      {notFoundMessage && (
        <div className="ui-card ui-top-indigo text-center py-12 max-w-xl mx-auto space-y-4">
          <div className="h-12 w-12 rounded-full bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center text-[#DC2626] mx-auto">
            <SearchX className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-[#0F172A]">
              Booking not found
            </h2>
            <p className="text-base text-[#64748B]">
              No confirmed airport taxi booking exists for number{" "}
              <span className="font-mono font-semibold text-[#0F172A]">
                {bookingNumber}
              </span>
              .
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={onBackToTraveler}
              className="ui-btn-primary ui-focus px-5 text-sm inline-flex items-center gap-2 cursor-pointer"
            >
              <span>Go to Traveler Portal</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {loadError && (
        <div className="ui-alert-error p-4 text-sm text-[#991B1B]">
          {loadError}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 space-y-6">
            <div className="ui-card-flush">
              <div className="bg-[#4F46E5] text-white px-6 py-6 flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="ui-badge ui-badge-booked">CONFIRMED</span>
                    <span className="font-mono text-xs text-[#E0E7FF]">
                      Request {summary.booking.request_id}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <span className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-white">
                      #{summary.booking.booking_number}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyBookingNumber()}
                      className="px-3 py-1.5 rounded-[6px] bg-white/15 hover:bg-white/25 border border-white/25 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer ui-interactive"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-[#86EFAC]" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy 10-digit #</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#E0E7FF] block">
                    Confirmed Fare
                  </span>
                  <span className="font-mono text-2xl sm:text-3xl font-bold text-white block mt-0.5">
                    {formatInr(summary.booking.price_inr)}
                  </span>
                </div>
              </div>

              <div className="p-6 space-y-6 bg-white">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[8px] p-4 space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-2">
                      <span className="h-7 w-7 ui-icon-circle ui-icon-indigo">
                        <PlaneLanding className="h-3.5 w-3.5" />
                      </span>
                      <span>Arrival Flight</span>
                    </span>
                    <p className="text-base font-bold text-[#0F172A]">
                      {summary.flight
                        ? `${summary.flight.flight_id} · ${summary.flight.airline}`
                        : summary.booking.flight_id}
                    </p>
                    {summary.flight && (
                      <p className="font-mono text-xs text-[#64748B]">
                        {summary.flight.from} → {summary.flight.to} · Lands{" "}
                        {formatDateTimeLabel(summary.flight.arrival_local)}
                      </p>
                    )}
                  </div>

                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[8px] p-4 space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-2">
                      <span className="h-7 w-7 ui-icon-circle ui-icon-indigo">
                        <MapPin className="h-3.5 w-3.5" />
                      </span>
                      <span>Destination Hotel</span>
                    </span>
                    <p className="text-base font-bold text-[#0F172A]">
                      {summary.hotel ? summary.hotel.name : summary.booking.hotel_id}
                    </p>
                    {summary.hotel && (
                      <p className="text-xs text-[#64748B]">
                        {summary.hotel.city} · {summary.hotel.area}
                        {summary.route ? ` (${summary.route.drive_minutes}m · ${summary.route.distance_km} km)` : ""}
                      </p>
                    )}
                  </div>

                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[8px] p-4 space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-2">
                      <span className="h-7 w-7 ui-icon-circle ui-icon-amber">
                        <Clock className="h-3.5 w-3.5" />
                      </span>
                      <span>Pickup Schedule</span>
                    </span>
                    <p className="font-mono text-base font-bold text-[#0F172A]">
                      {formatDateTimeLabel(summary.booking.pickup)}
                    </p>
                    <p className="font-mono text-xs text-[#B45309]">
                      Car Busy Slot: {summary.booking.busy_start.slice(11, 16)}–{summary.booking.busy_end.slice(11, 16)} (R6)
                    </p>
                  </div>

                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[8px] p-4 space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-2">
                      <span className="h-7 w-7 ui-icon-circle ui-icon-teal">
                        <CarTaxiFront className="h-3.5 w-3.5" />
                      </span>
                      <span>Assigned Supplier &amp; Car</span>
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-bold text-[#0F172A]">
                        {summary.company ? summary.company.name : summary.booking.company_id}
                      </p>
                      {summary.company && (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-[#B45309] bg-[#FEF3C7] px-2 py-0.5 rounded-full">
                          <Star className="h-3 w-3 text-[#F59E0B] fill-[#F59E0B]" />
                          {summary.company.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-[#0F766E] font-medium">
                      Vehicle {summary.booking.vehicle_id}
                      {summary.vehicle
                        ? ` · ${summary.vehicle.type} (${summary.vehicle.seats} seats, ${summary.vehicle.large_bags}L/${summary.vehicle.small_bags}S bags)`
                        : ""}
                    </p>
                  </div>
                </div>

                {summary.request && (
                  <div className="pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 text-sm text-[#64748B]">
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="inline-flex items-center gap-2 text-[#0F172A] font-medium">
                        <span className="h-7 w-7 ui-icon-circle ui-icon-indigo">
                          <Users className="h-3.5 w-3.5" />
                        </span>
                        <span>
                          {summary.request.traveler_name} · {summary.request.adults} adult
                          {summary.request.adults === 1 ? "" : "s"}
                          {summary.request.child_ages.length > 0
                            ? ` + ${summary.request.child_ages.length} child (${summary.request.child_ages.join(", ")}y)`
                            : ""}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Luggage className="h-4 w-4 text-[#64748B]" />
                        {summary.request.large_bags} large · {summary.request.small_bags} small bags
                      </span>
                    </div>

                    {onOpenSupplier && (
                      <button
                        type="button"
                        onClick={() => onOpenSupplier(summary.booking.company_id)}
                        className="text-sm font-semibold text-[#0F766E] hover:text-[#115E59] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Building2 className="h-4 w-4" />
                        <span>Open {summary.company?.name ?? "Supplier"} Workspace</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="ui-card space-y-4">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="h-8 w-8 ui-icon-circle ui-icon-amber">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <h2 className="text-lg font-bold text-[#0F172A]">
                    Change Request History ({summary.change_requests.length})
                  </h2>
                </div>
                {hasPendingChange && (
                  <span className="ui-badge ui-badge-pending">
                    Awaiting supplier decision
                  </span>
                )}
              </div>

              {summary.change_requests.length === 0 ? (
                <p className="text-sm text-[#64748B]">
                  No flight or pickup changes have been requested for this booking yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {summary.change_requests.map((chg) => (
                    <div
                      key={chg.change_id}
                      className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[8px] p-4 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-[6px] bg-[#EEF2FF] border border-[#C7D2FE] text-[#4338CA]">
                          {chg.change_id}
                        </span>
                        <span className={getChangeBadgeClass(chg.status)}>
                          {chg.status}
                        </span>
                      </div>

                      <div className="text-sm text-[#0F172A] flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-[#64748B]">
                          {chg.prev_flight_id} ({formatDateTimeLabel(chg.prev_pickup)})
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-[#4F46E5]" />
                        <span className="font-mono text-xs font-semibold text-[#0F172A]">
                          {chg.new_flight_id} ({formatDateTimeLabel(chg.new_pickup)})
                        </span>
                      </div>

                      {chg.decision_reason && (
                        <p className="text-xs text-[#64748B]">
                          {chg.decision_reason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div
            className={`lg:col-span-5 ui-card ${
              hasPendingChange ? "ui-top-amber" : "ui-top-indigo"
            } space-y-5`}
          >
            <div className="border-b border-[#E2E8F0] pb-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-[#0F172A]">
                  Request Flight or Pickup Change
                </h2>
                <span className="ui-badge ui-badge-accent font-mono">R9 · M7</span>
              </div>
              <p className="text-sm text-[#64748B] mt-1">
                Send a new arrival flight or pickup time to {summary.company?.name ?? "your supplier"}. Rejected changes keep your current confirmed booking.
              </p>
            </div>

            {changeError && (
              <div className="ui-alert-error p-4 space-y-1">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#DC2626]">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {changeError.rule ? `Rule ${changeError.rule} Refused` : "Change Refused"}
                </span>
                <p className="text-sm text-[#991B1B] leading-relaxed">
                  {changeError.message}
                </p>
              </div>
            )}

            {changeSuccess && (
              <div className="ui-alert-success p-4 space-y-2">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-[#16A34A] shrink-0 mt-0.5" />
                  <p className="text-sm text-[#166534] leading-relaxed">
                    {changeSuccess}
                  </p>
                </div>
                {onOpenSupplier && (
                  <button
                    type="button"
                    onClick={() => onOpenSupplier(summary.booking.company_id)}
                    className="text-xs font-semibold text-[#0F766E] hover:text-[#115E59] hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Switch to {summary.company?.name ?? "Supplier"} to Accept / Reject</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {changeWarning && (
              <div className="ui-alert-warning p-4 text-sm text-[#92400E]">
                {changeWarning}
              </div>
            )}

            <form
              onSubmit={(e) => void handleSubmitChangeRequest(e)}
              noValidate
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="change-flight-select"
                  className="block text-sm font-medium text-[#0F172A] mb-1.5"
                >
                  Arrival Flight (Keep current or choose new flight)
                </label>
                <div className="relative ui-input-wrap">
                  <select
                    id="change-flight-select"
                    value={newFlightId}
                    onChange={(e) => setNewFlightId(e.target.value)}
                    className="w-full h-full appearance-none bg-transparent pl-3.5 pr-9 text-sm text-[#0F172A] focus:outline-none cursor-pointer"
                  >
                    {flightsGrouped.sameCityFlights.length > 0 && (
                      <optgroup
                        label={`Flights serving ${summary.hotel?.city ?? "hotel city"} (${flightsGrouped.sameCityFlights.length})`}
                        className="bg-white text-[#64748B]"
                      >
                        {flightsGrouped.sameCityFlights.map((fl) => (
                          <option
                            key={fl.flight_id}
                            value={fl.flight_id}
                            className="bg-white text-[#0F172A]"
                          >
                            {fl.flight_id} · {fl.from} → {fl.to} · Lands {formatDateTimeLabel(fl.arrival_local)}
                            {fl.flight_id === summary.booking.flight_id ? " (Current)" : ""}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {flightsGrouped.otherFlights.length > 0 && (
                      <optgroup
                        label={`Other catalog flights (${flightsGrouped.otherFlights.length})`}
                        className="bg-white text-[#64748B]"
                      >
                        {flightsGrouped.otherFlights.map((fl) => (
                          <option
                            key={fl.flight_id}
                            value={fl.flight_id}
                            className="bg-white text-[#0F172A]"
                          >
                            {fl.flight_id} · {fl.from} → {fl.to} · Lands {formatDateTimeLabel(fl.arrival_local)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <ChevronDown className="h-4 w-4 text-[#4F46E5] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="change-pickup-input"
                    className="text-sm font-medium text-[#0F172A]"
                  >
                    New Pickup Time (Local Airport Time · R2)
                  </label>
                  {earliestNewPickup && (
                    <button
                      type="button"
                      onClick={() => setNewPickup(earliestNewPickup)}
                      className="text-xs font-semibold text-[#4F46E5] hover:text-[#4338CA] hover:underline cursor-pointer"
                    >
                      Earliest {earliestNewPickup.slice(11, 16)}
                    </button>
                  )}
                </div>
                <input
                  id="change-pickup-input"
                  type="datetime-local"
                  value={newPickup}
                  onChange={(e) => setNewPickup(e.target.value)}
                  className="ui-input w-full px-3.5 font-mono text-sm"
                />
                <p className="text-xs text-[#64748B] mt-1.5">
                  Must be at least 60 minutes after flight landing (R2). Leave blank when changing flights to default to landing + 60m.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmittingChange || hasPendingChange}
                className="ui-btn-primary ui-focus w-full px-5 text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span>
                  {hasPendingChange
                    ? "Change Request Pending Supplier Decision"
                    : isSubmittingChange
                      ? "Sending Change Request..."
                      : "Send Change Request"}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
