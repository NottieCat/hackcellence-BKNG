import { motion } from "framer-motion";
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
  Plane,
  PlaneLanding,
  RefreshCw,
  Search,
  SearchX,
  ShieldCheck,
  Star,
  Ticket,
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
import { ClickSparkButton, NudgeAlert } from "../components/ui/MotionPrimitives";

interface BookingSummaryPageProps {
  bookingNumber: string;
  bootstrap: BootstrapData | null;
  onBackToTraveler: () => void;
  onOpenBooking?: (bookingNumber: string) => void;
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

function getChangeBadge(status: ChangeStatus): { label: string; className: string } {
  if (status === "ACCEPTED") {
    return { label: "Approved", className: "ui-badge ui-badge-booked" };
  }
  if (status === "REJECTED") {
    return { label: "Declined", className: "ui-badge ui-badge-rejected" };
  }
  return { label: "Pending Review", className: "ui-badge ui-badge-pending" };
}

export function BookingSummaryPage({
  bookingNumber,
  bootstrap,
  onBackToTraveler,
  onOpenBooking,
  onOpenSupplier
}: BookingSummaryPageProps) {
  const [summary, setSummary] = useState<BookingSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [notFoundMessage, setNotFoundMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [inlineLookupInput, setInlineLookupInput] = useState<string>("");

  const [newFlightId, setNewFlightId] = useState<string>("");
  const [showAllCatalogFlights, setShowAllCatalogFlights] = useState<boolean>(false);
  const [newPickup, setNewPickup] = useState<string>("");
  const [isSubmittingChange, setIsSubmittingChange] = useState<boolean>(false);
  const [changeError, setChangeError] = useState<FormError | null>(null);
  const [changeErrorSeq, setChangeErrorSeq] = useState<number>(0);
  const [changeSuccess, setChangeSuccess] = useState<string | null>(null);
  const [changeWarning, setChangeWarning] = useState<string | null>(null);

  const loadSummary = useCallback(
    async (silent = false) => {
      const clean = bookingNumber.trim();
      if (!clean) {
        setSummary(null);
        setNotFoundMessage(null);
        setLoadError(null);
        return;
      }

      if (!silent) {
        setIsLoading(true);
      }
      setNotFoundMessage(null);
      setLoadError(null);

      try {
        const data = await fetchBookingSummary(clean);
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
          setLoadError("Unable to load transfer pass right now.");
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
    setShowAllCatalogFlights(false);
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

  const selectableFlights = useMemo(() => {
    if (showAllCatalogFlights) {
      return allFlights;
    }
    const hotelCity = summary?.hotel?.city;
    const airports = bootstrap?.airports ?? [];
    const matchingAirports = new Set(
      airports
        .filter((a) => (hotelCity ? a.serves_cities?.includes(hotelCity) : false))
        .map((a) => a.code)
    );
    const sameCity = allFlights.filter((f) => matchingAirports.has(f.to));
    const sampleCrossCity = allFlights.filter((f) => !matchingAirports.has(f.to)).slice(0, 12);
    return [...sameCity, ...sampleCrossCity];
  }, [allFlights, bootstrap?.airports, showAllCatalogFlights, summary?.hotel?.city]);

  const selectedNewFlight = useMemo(
    () => allFlights.find((f) => f.flight_id === newFlightId) ?? summary?.flight ?? null,
    [allFlights, newFlightId, summary?.flight]
  );

  const recommendedNewPickup = selectedNewFlight
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

  function handleInlineLookup(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = inlineLookupInput.trim();
    if (!trimmed || !onOpenBooking) {
      return;
    }
    onOpenBooking(trimmed);
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
        `Update request ${response.change_request.change_id} sent to ${
          summary.company?.name ?? summary.booking.company_id
        }.`
      );

      if (!response.feasibility_preview.car_free_at_new_time) {
        setChangeWarning(
          `Schedule heads-up: ${
            response.feasibility_preview.conflict_reason ??
            "Your assigned vehicle is already reserved during the requested window"
          }. The operator will not be able to approve this time.`
        );
      }
      else if (
        !response.feasibility_preview.supplier_serves_new_airport ||
        !response.feasibility_preview.supplier_open_at_new_pickup
      ) {
        setChangeWarning(
          "Schedule heads-up: The selected arrival airport or pickup hour falls outside this operator's coverage or operating hours."
        );
      }

      setNewPickup("");
      await loadSummary(true);
    }
    catch (err) {
      setChangeErrorSeq((n) => n + 1);
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
          message: "Could not submit schedule update right now."
        });
      }
    }
    finally {
      setIsSubmittingChange(false);
    }
  }

  if (!bookingNumber.trim()) {
    return (
      <section className="max-w-xl mx-auto py-6">
        <div className="ui-card ui-top-indigo text-center space-y-5 py-10">
          <div className="h-12 w-12 ui-icon-circle ui-icon-indigo border border-[#C7D2FE] mx-auto">
            <Ticket className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold text-[#0F172A]">
              Retrieve Your Transfer Pass
            </h1>
            <p className="text-sm sm:text-base text-[#475569] max-w-md mx-auto">
              Enter your 10-digit confirmation number to view your chauffeur details or request a flight change.
            </p>
          </div>

          <form
            onSubmit={handleInlineLookup}
            className="flex flex-col sm:flex-row items-center justify-center gap-2.5 max-w-md mx-auto pt-1"
          >
            <div className="relative w-full">
              <Search className="h-4 w-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={inlineLookupInput}
                onChange={(e) => setInlineLookupInput(e.target.value)}
                placeholder="e.g. 2055527447"
                aria-label="Enter 10-digit pass number"
                className="ui-input w-full pl-10 pr-3.5 font-mono text-sm"
              />
            </div>
            <button
              type="submit"
              className="ui-btn-primary ui-focus px-6 w-full sm:w-auto text-sm cursor-pointer shrink-0"
            >
              Open Pass
            </button>
          </form>

          <div className="pt-2">
            <button
              type="button"
              onClick={onBackToTraveler}
              className="text-xs font-semibold text-[#4F46E5] hover:text-[#4338CA] hover:underline cursor-pointer"
            >
              Or browse your booked rides in Passenger Trips →
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-7">
      <div className="ui-card ui-top-indigo flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 ui-icon-circle ui-icon-indigo border border-[#C7D2FE] mt-0.5">
            <Ticket className="h-6 w-6 stroke-[1.8]" />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#4F46E5] block mb-1">
              Airport Transfer Pass
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A]">
              Pass <span className="font-mono text-[#4F46E5]">#{bookingNumber}</span>
            </h1>
            <p className="text-sm sm:text-base text-[#475569] mt-1">
              Your confirmed chauffeur manifest, pickup window, and flexible flight-change protection.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBackToTraveler}
            className="ui-btn-secondary ui-focus px-4 text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Trips</span>
          </button>

          <button
            type="button"
            onClick={() => void loadSummary(false)}
            className="ui-btn-ghost ui-focus px-3.5 text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                isLoading ? "animate-spin text-[#4F46E5]" : "text-[#475569]"
              }`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {isLoading && !summary && !notFoundMessage && (
        <div className="ui-card space-y-4">
          <div className="h-6 w-56 skeleton-bar" />
          <div className="h-4 w-80 skeleton-bar" />
          <div className="h-36 w-full skeleton-bar" />
        </div>
      )}

      {notFoundMessage && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="ui-card ui-top-indigo text-center py-12 max-w-xl mx-auto space-y-4"
        >
          <div className="h-12 w-12 rounded-full bg-[#FFF1F2] border border-[#FECDD3] flex items-center justify-center text-[#E11D48] mx-auto">
            <SearchX className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-[#0F172A]">
              Booking not found
            </h2>
            <p className="text-sm sm:text-base text-[#475569]">
              No confirmed airport transfer exists for pass number{" "}
              <span className="font-mono font-semibold text-[#0F172A]">
                {bookingNumber}
              </span>
              . Double-check all 10 digits and try again.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={onBackToTraveler}
              className="ui-btn-primary ui-focus px-5 text-sm inline-flex items-center gap-2 cursor-pointer"
            >
              <span>Return to Passenger Trips</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}

      {loadError && (
        <div className="ui-alert-error p-4 text-sm text-[#BE123C]">
          {loadError}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
          <div className="lg:col-span-7 space-y-6">
            <div className="ui-card-flush">
              <div className="ui-glare bg-gradient-to-br from-[#4F46E5] via-[#4338CA] to-[#3730A3] text-white px-6 py-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#10B981]/20 text-[#A7F3D0] border border-[#6EE7B7]/40">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>CONFIRMED PASS</span>
                    </span>
                    <span className="font-mono text-xs text-[#E0E7FF]">
                      Trip {summary.booking.request_id}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#C7D2FE] block">
                      Guaranteed Total
                    </span>
                    <span className="font-mono text-2xl sm:text-3xl font-bold text-white block">
                      {formatInr(summary.booking.price_inr)}
                    </span>
                  </div>
                </div>

                <div className="bg-white/10 border border-white/15 rounded-[12px] px-4 py-3.5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-[#C7D2FE] block">
                      Arrival Airport
                    </span>
                    <span className="font-mono text-xl sm:text-2xl font-bold text-white">
                      {summary.flight?.to ?? summary.booking.flight_id}
                    </span>
                    {summary.flight && (
                      <span className="font-mono text-xs text-[#E0E7FF] block">
                        {summary.flight.flight_id} from {summary.flight.from}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[#C7D2FE] flex-1 justify-center min-w-[90px]">
                    <span className="h-px flex-1 border-t border-dashed border-white/35 max-w-16" />
                    <Plane className="h-4 w-4 text-white shrink-0" />
                    <span className="h-px flex-1 border-t border-dashed border-white/35 max-w-16" />
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] uppercase tracking-wider text-[#C7D2FE] block">
                      Drop-off District
                    </span>
                    <span className="font-display text-lg sm:text-xl font-bold text-white block">
                      {summary.hotel ? summary.hotel.area : summary.booking.hotel_id}
                    </span>
                    {summary.hotel && (
                      <span className="text-xs text-[#E0E7FF] block">
                        {summary.hotel.city}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-[#C7D2FE] block mb-0.5">
                      10-Digit Transfer Pass Number
                    </span>
                    <span className="font-mono text-2xl sm:text-3xl font-bold tracking-wider text-white">
                      #{summary.booking.booking_number}
                    </span>
                  </div>

                  <ClickSparkButton
                    type="button"
                    sparkColor="#A7F3D0"
                    onClick={() => void handleCopyBookingNumber()}
                    className="px-3.5 py-2 rounded-[9px] bg-white/15 hover:bg-white/25 border border-white/25 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer ui-interactive"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#6EE7B7]" />
                        <span>Copied Pass #</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy 10-digit #</span>
                      </>
                    )}
                  </ClickSparkButton>
                </div>
              </div>

              <div className="ui-pass-perf" aria-hidden="true">
                <div className="ui-pass-perf-line" />
              </div>

              <div className="px-6 pb-6 pt-3 space-y-5 bg-white">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-[#F8FAFC] border border-[#E5E9F2] rounded-[11px] p-4 space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-2">
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

                  <div className="bg-[#F8FAFC] border border-[#E5E9F2] rounded-[11px] p-4 space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-2">
                      <span className="h-7 w-7 ui-icon-circle ui-icon-indigo">
                        <Building2 className="h-3.5 w-3.5" />
                      </span>
                      <span>Destination Hotel</span>
                    </span>
                    <p className="text-base font-bold text-[#0F172A]">
                      {summary.hotel ? summary.hotel.name : summary.booking.hotel_id}
                    </p>
                    {summary.hotel && (
                      <p className="text-xs text-[#64748B]">
                        {summary.hotel.city} · {summary.hotel.area}
                        {summary.route
                          ? ` (${summary.route.drive_minutes} min · ${summary.route.distance_km} km)`
                          : ""}
                      </p>
                    )}
                  </div>

                  <div className="bg-[#F8FAFC] border border-[#E5E9F2] rounded-[11px] p-4 space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-2">
                      <span className="h-7 w-7 ui-icon-circle ui-icon-amber">
                        <Clock className="h-3.5 w-3.5" />
                      </span>
                      <span>Scheduled Pickup</span>
                    </span>
                    <p className="font-mono text-base font-bold text-[#0F172A]">
                      {formatDateTimeLabel(summary.booking.pickup)}
                    </p>
                    <p className="font-mono text-xs text-[#B45309]">
                      Vehicle Reserved: {summary.booking.busy_start.slice(11, 16)}–
                      {summary.booking.busy_end.slice(11, 16)}
                    </p>
                  </div>

                  <div className="bg-[#F8FAFC] border border-[#E5E9F2] rounded-[11px] p-4 space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-2">
                      <span className="h-7 w-7 ui-icon-circle ui-icon-teal">
                        <CarTaxiFront className="h-3.5 w-3.5" />
                      </span>
                      <span>Operator &amp; Vehicle</span>
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-bold text-[#0F172A]">
                        {summary.company ? summary.company.name : summary.booking.company_id}
                      </p>
                      {summary.company && (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] px-2 py-0.5 rounded-full">
                          <Star className="h-3 w-3 text-[#F59E0B] fill-[#F59E0B]" />
                          {summary.company.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-[#0F766E] font-semibold">
                      Vehicle {summary.booking.vehicle_id}
                      {summary.vehicle
                        ? ` · ${summary.vehicle.type} (${summary.vehicle.seats} seats, ${summary.vehicle.large_bags}L/${summary.vehicle.small_bags}S)`
                        : ""}
                    </p>
                  </div>
                </div>

                {summary.request && (
                  <div className="pt-4 border-t border-[#E5E9F2] flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-[#475569]">
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="inline-flex items-center gap-2 text-[#0F172A] font-semibold">
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
                        <Luggage className="h-4 w-4 text-[#0D9488]" />
                        <span>
                          {summary.request.large_bags} large · {summary.request.small_bags} small bags
                        </span>
                      </span>
                    </div>

                    {onOpenSupplier && (
                      <button
                        type="button"
                        onClick={() => onOpenSupplier(summary.booking.company_id)}
                        className="text-xs sm:text-sm font-semibold text-[#0D9488] hover:text-[#0F766E] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Building2 className="h-4 w-4" />
                        <span>Open {summary.company?.name ?? "Operator"} Desk</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="ui-card space-y-4">
              <div className="flex items-center justify-between border-b border-[#E5E9F2] pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="h-8 w-8 ui-icon-circle ui-icon-amber">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-[#0F172A]">
                      Schedule Update History ({summary.change_requests.length})
                    </h2>
                    <p className="text-xs text-[#64748B]">
                      Track status of requested flight or pickup changes
                    </p>
                  </div>
                </div>
                {hasPendingChange && (
                  <span className="ui-badge ui-badge-pending">
                    Awaiting operator review
                  </span>
                )}
              </div>

              {summary.change_requests.length === 0 ? (
                <p className="text-sm text-[#64748B]">
                  No schedule updates requested yet. Your pickup time above is confirmed.
                </p>
              ) : (
                <div className="space-y-3">
                  {summary.change_requests.map((chg) => {
                    const badge = getChangeBadge(chg.status);
                    return (
                      <div
                        key={chg.change_id}
                        className="bg-[#F8FAFC] border border-[#E5E9F2] rounded-[10px] p-4 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-[7px] bg-[#EEF2FF] border border-[#C7D2FE] text-[#4338CA]">
                            {chg.change_id}
                          </span>
                          <span className={badge.className}>
                            {badge.label}
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
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div
            className={`lg:col-span-5 ui-card ${
              hasPendingChange ? "ui-top-amber" : "ui-top-indigo"
            } space-y-5`}
          >
            <div className="border-b border-[#E5E9F2] pb-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-[#0F172A]">
                  Flight Delayed or Rescheduled?
                </h2>
                <span className="ui-badge ui-badge-accent">Flexible Pass</span>
              </div>
              <p className="text-xs sm:text-sm text-[#64748B] mt-1 leading-relaxed">
                Request an updated arrival flight or pickup time with{" "}
                {summary.company?.name ?? "your operator"}. If declined, your current booking stays intact.
              </p>
            </div>

            {changeError && (
              <NudgeAlert
                triggerKey={`chg-submit-err-${changeErrorSeq}`}
                className="ui-alert-error p-4 space-y-1"
              >
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#BE123C]">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    {changeError.rule
                      ? `Update Refused (${changeError.rule})`
                      : "Update Refused"}
                  </span>
                </span>
                <p className="text-sm text-[#9F1239] leading-relaxed">
                  {changeError.message}
                </p>
              </NudgeAlert>
            )}

            {changeSuccess && (
              <div className="ui-alert-success p-4 space-y-2">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-[#059669] shrink-0 mt-0.5" />
                  <p className="text-sm text-[#065F46] leading-relaxed">
                    {changeSuccess}
                  </p>
                </div>
                {onOpenSupplier && (
                  <button
                    type="button"
                    onClick={() => onOpenSupplier(summary.booking.company_id)}
                    className="text-xs font-semibold text-[#0F766E] hover:text-[#115E59] hover:underline inline-flex items-center gap-1 cursor-pointer pl-7"
                  >
                    <span>
                      Open {summary.company?.name ?? "Operator"} Desk to approve or decline →
                    </span>
                  </button>
                )}
              </div>
            )}

            {changeWarning && (
              <div className="ui-alert-warning p-4 text-xs sm:text-sm text-[#92400E] leading-relaxed">
                {changeWarning}
              </div>
            )}

            <form
              onSubmit={(e) => void handleSubmitChangeRequest(e)}
              noValidate
              className="space-y-4"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="change-flight-select"
                    className="text-xs font-semibold uppercase tracking-wider text-[#475569]"
                  >
                    Arrival Flight
                  </label>
                  {!showAllCatalogFlights && allFlights.length > selectableFlights.length && (
                    <button
                      type="button"
                      onClick={() => setShowAllCatalogFlights(true)}
                      className="text-xs font-semibold text-[#4F46E5] hover:text-[#4338CA] hover:underline cursor-pointer"
                    >
                      Show all {allFlights.length} flights
                    </button>
                  )}
                </div>
                <div className="relative ui-input-wrap">
                  <select
                    id="change-flight-select"
                    value={newFlightId}
                    onChange={(e) => setNewFlightId(e.target.value)}
                    className="w-full h-full appearance-none bg-transparent pl-3.5 pr-9 text-sm text-[#0F172A] focus:outline-none cursor-pointer"
                  >
                    {selectableFlights.map((fl) => (
                      <option
                        key={fl.flight_id}
                        value={fl.flight_id}
                        className="bg-white text-[#0F172A]"
                      >
                        {fl.flight_id} · {fl.from} → {fl.to} · Lands {formatDateTimeLabel(fl.arrival_local)}
                        {fl.flight_id === summary.booking.flight_id ? " (Current)" : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="h-4 w-4 text-[#4F46E5] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="change-pickup-input"
                    className="text-xs font-semibold uppercase tracking-wider text-[#475569]"
                  >
                    Updated Pickup Time (Local Airport Time)
                  </label>
                  {recommendedNewPickup && (
                    <button
                      type="button"
                      onClick={() => setNewPickup(recommendedNewPickup)}
                      className="text-xs font-semibold text-[#4F46E5] hover:text-[#4338CA] hover:underline cursor-pointer"
                    >
                      Use +60m ({recommendedNewPickup.slice(11, 16)})
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
                  Must fall between 20 minutes and 3 hours after flight arrival. Leave blank when switching flights to default to arrival + 60 minutes.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmittingChange || hasPendingChange}
                className="ui-btn-primary ui-focus w-full px-5 text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span>
                  {hasPendingChange
                    ? "Update Pending Operator Review"
                    : isSubmittingChange
                      ? "Submitting Request..."
                      : "Request Schedule Update"}
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
