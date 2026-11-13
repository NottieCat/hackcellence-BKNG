import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  IndianRupee,
  Luggage,
  MapPin,
  PlaneLanding,
  RefreshCw,
  ShieldCheck,
  Star,
  Ticket,
  Users,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiRuleError,
  createSupplierOffer,
  decideChangeRequest,
  fetchSupplierDashboard
} from "../api/client";
import type {
  SupplierCompany,
  SupplierDashboardData,
  SupplierServableRequest
} from "../api/client";
import {
  ClickSparkButton,
  NudgeAlert,
  SpotlightCard
} from "../components/ui/MotionPrimitives";

interface SupplierWorkspaceProps {
  companyId: string;
  allSuppliers?: SupplierCompany[];
  fallbackCompany: SupplierCompany | null;
  onSelectSupplier?: (companyId: string) => void;
  onOpenBooking: (bookingNumber: string) => void;
  onSwitchToTraveler?: () => void;
  onCatalogRefresh?: () => void;
}

interface OfferDraft {
  vehicleId: string;
  priceInr: string;
  expirySeconds: string;
}

interface FeedbackBanner {
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

function getOfferBadgeClass(status: string): string {
  if (status === "BOOKED") {
    return "ui-badge ui-badge-booked";
  }
  if (status === "REJECTED") {
    return "ui-badge ui-badge-rejected";
  }
  if (status === "NOT_CHOSEN" || status === "EXPIRED") {
    return "ui-badge ui-badge-neutral";
  }
  return "ui-badge ui-badge-open";
}

function formatOfferStatusText(status: string): string {
  if (status === "BOOKED") {
    return "Booked";
  }
  if (status === "REJECTED") {
    return "Declined";
  }
  if (status === "NOT_CHOSEN") {
    return "Not chosen";
  }
  if (status === "EXPIRED") {
    return "Expired";
  }
  return "Sent";
}

function buildInitialDraft(item: SupplierServableRequest): OfferDraft {
  const preferredVehicle =
    item.vehicle_evaluations.find((ev) => ev.eligible && !ev.already_offered_open) ??
    item.vehicle_evaluations.find((ev) => ev.eligible) ??
    item.vehicle_evaluations[0];

  return {
    vehicleId: preferredVehicle?.vehicle.vehicle_id ?? "",
    priceInr: String(item.request.price_inr),
    expirySeconds: ""
  };
}

export function SupplierWorkspace({
  companyId,
  allSuppliers = [],
  fallbackCompany,
  onSelectSupplier,
  onOpenBooking,
  onSwitchToTraveler,
  onCatalogRefresh
}: SupplierWorkspaceProps) {
  const [dashboard, setDashboard] = useState<SupplierDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Record<string, OfferDraft>>({});
  const [submittingReqId, setSubmittingReqId] = useState<string | null>(null);
  const [offerErrors, setOfferErrors] = useState<Record<string, FeedbackBanner | null>>({});
  const [offerErrorSeq, setOfferErrorSeq] = useState<Record<string, number>>({});
  const [offerSuccess, setOfferSuccess] = useState<Record<string, string | null>>({});

  const [decidingChangeId, setDecidingChangeId] = useState<string | null>(null);
  const [changeErrors, setChangeErrors] = useState<Record<string, FeedbackBanner | null>>({});
  const [changeErrorSeq, setChangeErrorSeq] = useState<Record<string, number>>({});
  const [changeNotice, setChangeNotice] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!companyId) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await fetchSupplierDashboard(companyId);
      setDashboard(data);

      setDrafts((prev) => {
        const next: Record<string, OfferDraft> = { ...prev };
        for (const item of data.servable_requests) {
          const reqId = item.request.request_id;
          if (!next[reqId]) {
            next[reqId] = buildInitialDraft(item);
          }
        }
        return next;
      });
    }
    catch (err) {
      if (err instanceof ApiRuleError) {
        setLoadError(err.message);
      }
      else {
        setLoadError("Unable to load operator workspace right now.");
      }
    }
    finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setDashboard(null);
    setOfferErrors({});
    setOfferSuccess({});
    setChangeErrors({});
    setChangeNotice(null);
    void loadDashboard();
  }, [loadDashboard]);

  function updateDraft(
    item: SupplierServableRequest,
    patch: Partial<OfferDraft>
  ): void {
    const reqId = item.request.request_id;
    setDrafts((prev) => {
      const current = prev[reqId] ?? buildInitialDraft(item);
      return {
        ...prev,
        [reqId]: {
          ...current,
          ...patch
        }
      };
    });
  }

  async function handleAssignCar(
    event: FormEvent<HTMLFormElement>,
    item: SupplierServableRequest
  ): Promise<void> {
    event.preventDefault();
    const reqId = item.request.request_id;
    const draft = drafts[reqId] ?? buildInitialDraft(item);

    setSubmittingReqId(reqId);
    setOfferErrors((prev) => ({ ...prev, [reqId]: null }));
    setOfferSuccess((prev) => ({ ...prev, [reqId]: null }));

    try {
      const parsedPrice = draft.priceInr.trim() === "" ? NaN : Number(draft.priceInr);
      const parsedExpiry =
        draft.expirySeconds.trim() === "" ? undefined : Number(draft.expirySeconds);

      const response = await createSupplierOffer(companyId, {
        request_id: reqId,
        vehicle_id: draft.vehicleId,
        price_inr: parsedPrice,
        expires_in_seconds: parsedExpiry
      });

      setOfferSuccess((prev) => ({
        ...prev,
        [reqId]: `Quote sent: Vehicle ${response.offer.vehicle_id} offered at ${formatInr(response.offer.price_inr)}.`
      }));

      const refreshed = await fetchSupplierDashboard(companyId);
      setDashboard(refreshed);

      const updatedItem = refreshed.servable_requests.find(
        (s) => s.request.request_id === reqId
      );
      if (updatedItem) {
        const nextFreeCar = updatedItem.vehicle_evaluations.find(
          (ev) => ev.eligible && !ev.already_offered_open
        );
        if (nextFreeCar) {
          setDrafts((prev) => ({
            ...prev,
            [reqId]: {
              ...(prev[reqId] ?? buildInitialDraft(updatedItem)),
              vehicleId: nextFreeCar.vehicle.vehicle_id
            }
          }));
        }
      }

      if (onCatalogRefresh) {
        onCatalogRefresh();
      }
    }
    catch (err) {
      setOfferErrorSeq((prev) => ({ ...prev, [reqId]: (prev[reqId] ?? 0) + 1 }));
      if (err instanceof ApiRuleError) {
        setOfferErrors((prev) => ({
          ...prev,
          [reqId]: {
            rule: err.rule,
            code: err.code,
            message: err.message
          }
        }));
      }
      else {
        setOfferErrors((prev) => ({
          ...prev,
          [reqId]: {
            code: "NETWORK_ERROR",
            message: "Could not send vehicle quote right now."
          }
        }));
      }
    }
    finally {
      setSubmittingReqId(null);
    }
  }

  async function handleChangeDecision(
    changeId: string,
    decision: "ACCEPT" | "REJECT"
  ): Promise<void> {
    setDecidingChangeId(changeId);
    setChangeErrors((prev) => ({ ...prev, [changeId]: null }));
    setChangeNotice(null);

    try {
      const result = await decideChangeRequest(changeId, decision);
      setChangeNotice(
        decision === "ACCEPT"
          ? `Schedule update approved. Pass #${result.booking.booking_number} moved to ${formatDateTimeLabel(result.booking.pickup)}.`
          : `Schedule update declined. Pass #${result.booking.booking_number} remains on its original schedule.`
      );
      await loadDashboard();
      if (onCatalogRefresh) {
        onCatalogRefresh();
      }
    }
    catch (err) {
      setChangeErrorSeq((prev) => ({ ...prev, [changeId]: (prev[changeId] ?? 0) + 1 }));
      if (err instanceof ApiRuleError) {
        setChangeErrors((prev) => ({
          ...prev,
          [changeId]: {
            rule: err.rule,
            code: err.code,
            message: err.message
          }
        }));
      }
      else {
        setChangeErrors((prev) => ({
          ...prev,
          [changeId]: {
            code: "DECISION_FAILED",
            message: "Unable to process schedule update decision."
          }
        }));
      }
    }
    finally {
      setDecidingChangeId(null);
    }
  }

  const company = dashboard?.company ?? fallbackCompany;
  const servableRequests = dashboard?.servable_requests ?? [];
  const pendingChanges = dashboard?.pending_change_requests ?? [];
  const fleetTimeline = dashboard?.fleet_timeline ?? [];
  const myBookings = dashboard?.my_bookings ?? [];
  const myOffers = dashboard?.my_offers ?? [];

  return (
    <section className="space-y-7">
      <div className="ui-card ui-top-teal flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 ui-icon-circle ui-icon-teal border border-[#99F6E4] mt-0.5">
            <Building2 className="h-6 w-6 stroke-[1.8]" />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#0D9488] block mb-1">
              Operator Dispatch Desk · {company?.company_id ?? companyId}
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A]">
              {company ? company.name : "Fleet Workspace"}
            </h1>
            <p className="text-sm sm:text-base text-[#475569] mt-1">
              View ride requests matching your airports, drop-off zones, and operating hours. Assign available vehicles with custom fares.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {allSuppliers.length > 0 && onSelectSupplier && (
            <div className="lg:hidden relative h-10 rounded-[9px] bg-[#F0FDFA] border border-[#99F6E4]">
              <select
                aria-label="Switch fleet operator"
                value={companyId}
                onChange={(e) => onSelectSupplier(e.target.value)}
                className="h-full appearance-none bg-transparent pl-3 pr-8 text-xs font-semibold text-[#0F766E] focus:outline-none cursor-pointer"
              >
                {allSuppliers.map((sup) => (
                  <option
                    key={sup.company_id}
                    value={sup.company_id}
                    className="bg-white text-[#0F172A]"
                  >
                    {sup.name} ({sup.airports.join(", ")})
                  </option>
                ))}
              </select>
              <ChevronDown className="h-3.5 w-3.5 text-[#0F766E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {company && (
            <>
              <span className="h-10 px-3.5 rounded-[9px] bg-[#F0FDFA] border border-[#99F6E4] text-xs sm:text-sm font-semibold text-[#0F766E] inline-flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#0D9488]" />
                <span>
                  {company.service_from}–{company.service_until}
                </span>
              </span>
              <span className="h-10 px-3 rounded-[9px] bg-[#FFFBEB] border border-[#FDE68A] text-xs sm:text-sm font-semibold text-[#B45309] inline-flex items-center gap-1.5 font-mono">
                <Star className="h-4 w-4 text-[#F59E0B] fill-[#F59E0B]" />
                <span>{company.rating.toFixed(1)}</span>
              </span>
            </>
          )}

          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="ui-btn-ghost ui-focus-teal px-3.5 text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                isLoading ? "animate-spin text-[#0D9488]" : "text-[#475569]"
              }`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="ui-alert-error p-4 text-sm text-[#BE123C]">
          {loadError}
        </div>
      )}

      <AnimatePresence>
        {changeNotice && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="ui-alert-success p-4 flex items-start gap-2.5"
          >
            <CheckCircle2 className="h-5 w-5 text-[#059669] shrink-0 mt-0.5" />
            <p className="text-sm text-[#065F46]">{changeNotice}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {pendingChanges.length > 0 && (
        <div className="ui-card ui-top-amber space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E9F2] pb-4">
            <div className="flex items-center gap-2.5">
              <span className="h-8 w-8 ui-icon-circle ui-icon-amber">
                <CalendarClock className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">
                  Passenger Flight &amp; Pickup Updates
                </h2>
                <p className="text-xs text-[#64748B]">
                  Approving verifies your assigned vehicle is free at the updated arrival window.
                </p>
              </div>
            </div>
            <span className="ui-badge ui-badge-pending">
              {pendingChanges.length} awaiting review
            </span>
          </div>

          <div className="space-y-4">
            {pendingChanges.map((chg) => {
              const chgErr = changeErrors[chg.change_id];
              const isBusyDeciding = decidingChangeId === chg.change_id;

              return (
                <div
                  key={chg.change_id}
                  className="bg-[#FFFBEB]/65 border border-[#FDE68A] rounded-[12px] p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-[7px] bg-white border border-[#FDE68A] text-[#92400E]">
                        {chg.change_id}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenBooking(chg.booking_number)}
                        className="font-mono text-xs sm:text-sm font-semibold text-[#4F46E5] hover:text-[#4338CA] hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Ticket className="h-3.5 w-3.5" />
                        <span>Pass #{chg.booking_number}</span>
                      </button>
                      {chg.booking && (
                        <span className="ui-badge ui-badge-teal font-mono">
                          Vehicle {chg.booking.vehicle_id}
                        </span>
                      )}
                    </div>
                    {chg.hotel && (
                      <span className="text-xs sm:text-sm text-[#475569] font-medium">
                        {chg.hotel.name} · {chg.hotel.city} ({chg.hotel.area})
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="bg-white border border-[#E5E9F2] rounded-[10px] p-3.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] block mb-1">
                        Current Confirmed Schedule
                      </span>
                      <p className="font-semibold text-[#0F172A]">
                        Flight {chg.prev_flight_id}
                        {chg.prev_flight ? ` (${chg.prev_flight.from} → ${chg.prev_flight.to})` : ""}
                      </p>
                      <p className="font-mono text-xs text-[#64748B] mt-1">
                        Pickup: {formatDateTimeLabel(chg.prev_pickup)}
                      </p>
                    </div>

                    <div className="bg-white border border-[#FCD34D] rounded-[10px] p-3.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#B45309] block mb-1">
                        Requested Updated Schedule
                      </span>
                      <p className="font-semibold text-[#0F172A]">
                        Flight {chg.new_flight_id}
                        {chg.new_flight ? ` (${chg.new_flight.from} → ${chg.new_flight.to})` : ""}
                      </p>
                      <p className="font-mono text-xs text-[#0F172A] mt-1">
                        New Pickup: {formatDateTimeLabel(chg.new_pickup)}
                      </p>
                      <p className="font-mono text-[11px] text-[#64748B] mt-0.5">
                        Reserved Window: {chg.new_busy_start.slice(11, 16)}–{chg.new_busy_end.slice(11, 16)}
                      </p>
                    </div>
                  </div>

                  <AnimatePresence mode="wait">
                    {chgErr && (
                      <NudgeAlert
                        triggerKey={`chg-err-${chg.change_id}-${changeErrorSeq[chg.change_id] ?? 0}`}
                        className="ui-alert-error p-3.5 space-y-1"
                      >
                        <span className="text-xs font-semibold text-[#BE123C] block">
                          {chgErr.rule
                            ? `Schedule Conflict (${chgErr.rule})`
                            : "Unable to Approve Update"}
                        </span>
                        <p className="text-sm text-[#9F1239]">{chgErr.message}</p>
                      </NudgeAlert>
                    )}
                  </AnimatePresence>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={isBusyDeciding}
                      onClick={() => void handleChangeDecision(chg.change_id, "ACCEPT")}
                      className="ui-btn-teal ui-focus-teal px-5 text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Approve Update</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusyDeciding}
                      onClick={() => void handleChangeDecision(chg.change_id, "REJECT")}
                      className="ui-btn-ghost ui-focus px-4 text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <XCircle className="h-4 w-4 text-[#E11D48]" />
                      <span>Decline &amp; Keep Original</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
        <div className="lg:col-span-7 space-y-5">
          <div className="ui-card flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">
                Matching Passenger Requests ({servableRequests.length})
              </h2>
              <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
                Pre-qualified trips matching your airports, drop-off zones, hours, and fleet capacity.
              </p>
            </div>
            <span className="ui-badge ui-badge-teal">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Qualified Feed</span>
            </span>
          </div>

          {isLoading && !dashboard && (
            <div className="space-y-4">
              {[0, 1].map((idx) => (
                <div key={idx} className="ui-card space-y-3">
                  <div className="h-5 w-48 skeleton-bar" />
                  <div className="h-4 w-72 skeleton-bar" />
                  <div className="h-12 w-full skeleton-bar" />
                </div>
              ))}
            </div>
          )}

          {dashboard && servableRequests.length === 0 && (
            <div className="ui-card text-center py-10 space-y-2">
              <p className="text-base font-bold text-[#0F172A]">
                No open passenger requests match {company?.name} right now
              </p>
              <p className="text-sm text-[#64748B] max-w-md mx-auto leading-relaxed">
                Requests automatically appear here when they land at {company?.airports.join(", ")}, travel to your covered hotel districts, and fit an available vehicle in your fleet.
              </p>
              {onSwitchToTraveler && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={onSwitchToTraveler}
                    className="ui-btn-secondary ui-focus px-4 text-xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Post a passenger request in Traveler View</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-5">
            {servableRequests.map((item, idx) => {
              const reqId = item.request.request_id;
              const draft = drafts[reqId] ?? buildInitialDraft(item);
              const selectedEval = item.vehicle_evaluations.find(
                (ev) => ev.vehicle.vehicle_id === draft.vehicleId
              );
              const errBanner = offerErrors[reqId];
              const okBanner = offerSuccess[reqId];
              const isSubmitting = submittingReqId === reqId;

              return (
                <motion.div
                  key={reqId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.22,
                    delay: Math.min(idx * 0.035, 0.18),
                    ease: [0.22, 1, 0.36, 1]
                  }}
                >
                  <SpotlightCard
                    spotlightColor="rgba(13, 148, 136, 0.055)"
                    className="ui-card ui-top-teal space-y-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E5E9F2] pb-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-[7px] bg-[#F0FDFA] border border-[#99F6E4] text-[#0F766E]">
                            {reqId}
                          </span>
                          <span className="text-lg font-bold text-[#0F172A]">
                            {item.request.traveler_name}
                          </span>
                          <span className="ui-badge ui-badge-open">Open</span>
                          {item.request.car_type && (
                            <span className="ui-badge ui-badge-accent font-mono">
                              {item.request.car_type} Only
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[11px] uppercase tracking-wider font-semibold text-[#64748B] block">
                          Passenger Target
                        </span>
                        <span className="font-mono text-xl font-bold text-[#0F172A] block">
                          {formatInr(item.request.price_inr)}
                        </span>
                        <span className="font-mono text-[11px] text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] px-2.5 py-0.5 rounded-full font-semibold inline-block mt-0.5">
                          Allowed {formatInr(item.route.price_min_inr)}–{formatInr(item.route.price_max_inr)}
                        </span>
                      </div>
                    </div>

                    <div className="bg-[#F8FAFC] border border-[#E5E9F2] rounded-[11px] p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-start gap-2.5">
                        <span className="h-8 w-8 ui-icon-circle ui-icon-indigo shrink-0">
                          <PlaneLanding className="h-4 w-4" />
                        </span>
                        <div>
                          <span className="font-semibold text-[#0F172A] block">
                            {item.flight.flight_id} · {item.flight.from} → {item.flight.to}
                          </span>
                          <span className="font-mono text-xs text-[#64748B]">
                            Lands {formatDateTimeLabel(item.flight.arrival_local)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <span className="h-8 w-8 ui-icon-circle ui-icon-teal shrink-0">
                          <Building2 className="h-4 w-4" />
                        </span>
                        <div>
                          <span className="font-semibold text-[#0F172A] block">
                            {item.hotel.name}
                          </span>
                          <span className="text-xs text-[#64748B]">
                            {item.hotel.city} · {item.hotel.area} ({item.route.drive_minutes} min drive)
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm text-[#475569]">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[#0F172A]">
                        <Clock className="h-4 w-4 text-[#D97706]" />
                        <span>
                          Pickup {formatDateTimeLabel(item.request.pickup)} (Busy{" "}
                          {item.busy_window.start.slice(11, 16)}–{item.busy_window.end.slice(11, 16)})
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-[#4F46E5]" />
                        <span>
                          {item.request.adults} adult{item.request.adults === 1 ? "" : "s"}
                          {item.request.child_ages.length > 0
                            ? ` + ${item.request.child_ages.length} child (${item.request.child_ages.join(", ")}y)`
                            : ""}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Luggage className="h-4 w-4 text-[#0D9488]" />
                        <span>
                          {item.request.large_bags} large · {item.request.small_bags} small bags
                        </span>
                      </span>
                    </div>

                    {item.existing_offers.length > 0 && (
                      <div className="bg-[#F0FDFA] border border-[#99F6E4] rounded-[10px] p-3.5 space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-[#0F766E] block">
                          Your Sent Quotes for This Trip ({item.existing_offers.length})
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {item.existing_offers.map((ofr) => (
                            <div
                              key={ofr.offer_id}
                              className="inline-flex items-center gap-2 bg-white border border-[#CBD5E1] rounded-[8px] px-3 py-1.5 text-xs"
                            >
                              <span className="font-mono font-semibold text-[#0F172A]">
                                {ofr.vehicle_id}
                              </span>
                              <span className="font-mono text-[#0F766E] font-semibold">
                                {formatInr(ofr.price_inr)}
                              </span>
                              <span className={getOfferBadgeClass(ofr.status)}>
                                {formatOfferStatusText(ofr.status)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <AnimatePresence mode="wait">
                      {errBanner && (
                        <NudgeAlert
                          triggerKey={`sup-err-${reqId}-${offerErrorSeq[reqId] ?? 0}`}
                          className="ui-alert-error p-4 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#BE123C]">
                              <AlertTriangle className="h-4 w-4 shrink-0" />
                              <span>
                                {errBanner.rule
                                  ? `Dispatch Refused (${errBanner.rule})`
                                  : "Dispatch Refused"}
                              </span>
                            </span>
                            {errBanner.code && (
                              <span className="font-mono text-xs text-[#9F1239]">
                                {errBanner.code}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-[#9F1239] leading-relaxed">
                            {errBanner.message}
                          </p>
                        </NudgeAlert>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {okBanner && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="ui-alert-success p-4 space-y-2"
                        >
                          <div className="flex items-start gap-2.5">
                            <CheckCircle2 className="h-5 w-5 text-[#059669] shrink-0 mt-0.5" />
                            <p className="text-sm text-[#065F46]">{okBanner}</p>
                          </div>
                          {onSwitchToTraveler && (
                            <button
                              type="button"
                              onClick={onSwitchToTraveler}
                              className="text-xs font-semibold text-[#4F46E5] hover:text-[#4338CA] hover:underline inline-flex items-center gap-1 cursor-pointer pl-7"
                            >
                              <span>Switch to Traveler View to review &amp; book →</span>
                            </button>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <form
                      onSubmit={(e) => void handleAssignCar(e, item)}
                      noValidate
                      className="pt-4 border-t border-[#E5E9F2] space-y-4"
                    >
                      <div>
                        <label
                          htmlFor={`vehicle-select-${reqId}`}
                          className="block text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1.5"
                        >
                          Select Fleet Vehicle (Multiple vehicles permitted per trip)
                        </label>
                        <div className="relative ui-input-wrap-teal">
                          <select
                            id={`vehicle-select-${reqId}`}
                            value={draft.vehicleId}
                            onChange={(e) => updateDraft(item, { vehicleId: e.target.value })}
                            className="w-full h-full appearance-none bg-transparent pl-3.5 pr-9 text-sm text-[#0F172A] focus:outline-none cursor-pointer"
                          >
                            {item.vehicle_evaluations.map((ev) => {
                              const v = ev.vehicle;
                              let statusSuffix = "Available · Fits party";
                              if (ev.already_offered_open) {
                                statusSuffix = "Quote already active";
                              }
                              else if (!ev.eligible) {
                                statusSuffix = `Ineligible (${ev.broken_rule ?? "Check"})`;
                              }

                              return (
                                <option
                                  key={v.vehicle_id}
                                  value={v.vehicle_id}
                                  className="bg-white text-[#0F172A]"
                                >
                                  {v.vehicle_id} · {v.type} ({v.seats} seats, {v.large_bags}L/{v.small_bags}S bags) — {statusSuffix}
                                </option>
                              );
                            })}
                          </select>
                          <ChevronDown className="h-4 w-4 text-[#0D9488] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>

                        {selectedEval && !selectedEval.eligible && selectedEval.reason && (
                          <p className="text-xs text-[#B45309] mt-1.5">
                            Heads up: {selectedEval.reason}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label
                              htmlFor={`offer-price-${reqId}`}
                              className="text-xs font-semibold uppercase tracking-wider text-[#475569]"
                            >
                              Your Quote Fare (INR)
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                updateDraft(item, { priceInr: String(item.request.price_inr) })
                              }
                              className="text-xs font-semibold text-[#0D9488] hover:text-[#0F766E] hover:underline cursor-pointer"
                            >
                              Match {formatInr(item.request.price_inr)}
                            </button>
                          </div>
                          <div className="relative">
                            <IndianRupee className="h-4 w-4 text-[#D97706] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              id={`offer-price-${reqId}`}
                              type="number"
                              value={draft.priceInr}
                              onChange={(e) => updateDraft(item, { priceInr: e.target.value })}
                              placeholder="Enter INR quote"
                              className="ui-input ui-input-teal w-full pl-9 pr-3.5 font-mono text-base"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor={`offer-expiry-${reqId}`}
                            className="block text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1.5"
                          >
                            Quote Validity Window
                          </label>
                          <div className="relative ui-input-wrap-teal">
                            <select
                              id={`offer-expiry-${reqId}`}
                              value={draft.expirySeconds}
                              onChange={(e) =>
                                updateDraft(item, { expirySeconds: e.target.value })
                              }
                              className="w-full h-full appearance-none bg-transparent pl-3.5 pr-9 text-sm text-[#0F172A] focus:outline-none cursor-pointer"
                            >
                              <option value="" className="bg-white text-[#0F172A]">
                                Open until booked
                              </option>
                              <option value="30" className="bg-white text-[#0F172A]">
                                Valid for 30 seconds
                              </option>
                              <option value="120" className="bg-white text-[#0F172A]">
                                Valid for 2 minutes
                              </option>
                              <option value="900" className="bg-white text-[#0F172A]">
                                Valid for 15 minutes
                              </option>
                            </select>
                            <ChevronDown className="h-4 w-4 text-[#0D9488] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>
                      </div>

                      <ClickSparkButton
                        type="submit"
                        sparkColor="#99F6E4"
                        disabled={isSubmitting}
                        className="ui-btn-teal ui-focus-teal w-full px-5 text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                      >
                        <span>{isSubmitting ? "Sending Quote..." : "Assign Vehicle & Send Quote"}</span>
                        <ArrowRight className="h-4 w-4" />
                      </ClickSparkButton>
                    </form>
                  </SpotlightCard>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="ui-card ui-top-teal space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E9F2] pb-4">
              <div className="flex items-center gap-2.5">
                <span className="h-8 w-8 ui-icon-circle ui-icon-teal">
                  <Clock className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-[#0F172A]">
                    Fleet Availability Schedule
                  </h2>
                  <p className="text-xs text-[#64748B]">
                    Live round-trip reservations across your vehicles
                  </p>
                </div>
              </div>
              <span className="ui-badge ui-badge-teal font-mono">
                {fleetTimeline.length} vehicles
              </span>
            </div>

            <div className="space-y-3">
              {fleetTimeline.map((entry) => {
                const v = entry.vehicle;
                const hasBlocks = entry.busy_slots.length > 0;

                return (
                  <div
                    key={v.vehicle_id}
                    className="bg-[#F8FAFC] border border-[#E5E9F2] rounded-[11px] p-4 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-[#0F172A]">
                          {v.vehicle_id}
                        </span>
                        <span className="ui-badge ui-badge-teal font-mono">
                          {v.type}
                        </span>
                      </div>
                      <span
                        className={
                          hasBlocks
                            ? "ui-badge ui-badge-pending"
                            : "ui-badge ui-badge-booked"
                        }
                      >
                        {hasBlocks
                          ? `${entry.busy_slots.length} reserved slot${
                              entry.busy_slots.length === 1 ? "" : "s"
                            }`
                          : "Available"}
                      </span>
                    </div>

                    <p className="font-mono text-xs text-[#64748B]">
                      {v.seats} seats · {v.large_bags} large / {v.small_bags} small bags
                    </p>

                    {hasBlocks && (
                      <div className="space-y-1.5 pt-2 border-t border-[#E5E9F2]">
                        {entry.busy_slots.map((slot, idx) => (
                          <div
                            key={`${slot.reference_id}-${idx}`}
                            className="bg-white border border-[#E5E9F2] rounded-[8px] px-3 py-2 flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="font-mono text-[#0F172A]">
                              {formatDateTimeLabel(slot.start)} → {slot.end.slice(11, 16)}
                            </span>
                            {slot.source_type === "BOOKING" ? (
                              <button
                                type="button"
                                onClick={() => onOpenBooking(slot.reference_id)}
                                className="font-mono font-semibold text-[#4F46E5] hover:text-[#4338CA] hover:underline cursor-pointer"
                              >
                                Pass #{slot.reference_id}
                              </button>
                            ) : (
                              <span className="font-mono text-[#64748B]">
                                {slot.reference_id}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {myBookings.length > 0 && (
            <div className="ui-card ui-top-green space-y-4">
              <div className="flex items-center justify-between border-b border-[#E5E9F2] pb-3">
                <h2 className="text-lg font-bold text-[#0F172A]">
                  Confirmed Transfers ({myBookings.length})
                </h2>
                <span className="ui-badge ui-badge-booked">Confirmed</span>
              </div>

              <div className="space-y-3">
                {myBookings.map((bk) => (
                  <div
                    key={bk.booking_number}
                    className="bg-[#F8FAFC] border border-[#E5E9F2] rounded-[10px] p-4 flex items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => onOpenBooking(bk.booking_number)}
                        className="font-mono text-sm font-bold text-[#4F46E5] hover:text-[#4338CA] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Ticket className="h-3.5 w-3.5" />
                        <span>Pass #{bk.booking_number}</span>
                      </button>
                      <p className="text-xs text-[#64748B]">
                        Vehicle {bk.vehicle_id} · {bk.flight_id} · {formatDateTimeLabel(bk.pickup)}
                      </p>
                    </div>
                    <span className="font-mono text-base font-bold text-[#0F172A]">
                      {formatInr(bk.price_inr)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {myOffers.length > 0 && (
            <div className="ui-card space-y-4">
              <div className="flex items-center justify-between border-b border-[#E5E9F2] pb-3">
                <h2 className="text-lg font-bold text-[#0F172A]">
                  Recent Sent Quotes ({myOffers.length})
                </h2>
              </div>

              <div className="space-y-2">
                {myOffers.map((ofr) => (
                  <div
                    key={ofr.offer_id}
                    className="bg-[#F8FAFC] border border-[#E5E9F2] rounded-[8px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-sm"
                  >
                    <div>
                      <span className="font-mono font-semibold text-[#0F172A]">
                        {ofr.vehicle_id}
                      </span>
                      <span className="text-[#94A3B8] mx-1.5">→</span>
                      <span className="font-mono text-xs text-[#64748B]">
                        {ofr.request_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-[#0F172A]">
                        {formatInr(ofr.price_inr)}
                      </span>
                      <span className={getOfferBadgeClass(ofr.status)}>
                        {formatOfferStatusText(ofr.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {company && (
            <div className="ui-card space-y-4">
              <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2.5">
                <span className="h-8 w-8 ui-icon-circle ui-icon-teal">
                  <MapPin className="h-4 w-4" />
                </span>
                <span>Operating Coverage</span>
              </h2>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B] block mb-2">
                  Served Airports
                </span>
                <div className="flex flex-wrap gap-2">
                  {company.airports.map((code) => (
                    <span key={code} className="ui-badge ui-badge-teal font-mono">
                      {code}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B] block mb-2">
                  Drop-off Districts ({company.areas.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {company.areas.map((zone) => (
                    <span
                      key={`${zone.city}-${zone.area}`}
                      className="ui-badge ui-badge-neutral"
                    >
                      {zone.city} · {zone.area}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
