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
  Star,
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

interface SupplierWorkspaceProps {
  companyId: string;
  fallbackCompany: SupplierCompany | null;
  onOpenBooking: (bookingNumber: string) => void;
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
  fallbackCompany,
  onOpenBooking,
  onCatalogRefresh
}: SupplierWorkspaceProps) {
  const [dashboard, setDashboard] = useState<SupplierDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Record<string, OfferDraft>>({});
  const [submittingReqId, setSubmittingReqId] = useState<string | null>(null);
  const [offerErrors, setOfferErrors] = useState<Record<string, FeedbackBanner | null>>({});
  const [offerSuccess, setOfferSuccess] = useState<Record<string, string | null>>({});

  const [decidingChangeId, setDecidingChangeId] = useState<string | null>(null);
  const [changeErrors, setChangeErrors] = useState<Record<string, FeedbackBanner | null>>({});
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
        setLoadError("Unable to load supplier dashboard from backend.");
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
        [reqId]: `Assigned ${response.offer.vehicle_id} at ${formatInr(response.offer.price_inr)} (${response.offer.offer_id}).`
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
            message: "Could not submit taxi offer to backend."
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
          ? `Change request ${changeId} accepted. Booking #${result.booking.booking_number} updated to pickup ${formatDateTimeLabel(result.booking.pickup)}.`
          : `Change request ${changeId} rejected. Original booking #${result.booking.booking_number} kept unchanged.`
      );
      await loadDashboard();
      if (onCatalogRefresh) {
        onCatalogRefresh();
      }
    }
    catch (err) {
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
            message: "Unable to process change request decision."
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
    <section className="panel-enter space-y-8">
      <div className="ui-card ui-top-teal flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 ui-icon-circle ui-icon-teal border border-[#99F6E4] mt-0.5">
            <Building2 className="h-6 w-6 stroke-[1.8]" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#0F766E] mb-1">
              Supplier Workspace · {company?.company_id ?? companyId}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A]">
              {company ? company.name : "Supplier Dashboard"}
            </h1>
            <p className="text-base text-[#64748B] mt-1">
              Review open ride requests your fleet can serve (R4), assign cars with your price (R7), and manage booking changes (R9).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {company && (
            <>
              <span className="h-11 px-3.5 rounded-[6px] bg-[#F0FDFA] border border-[#99F6E4] text-sm font-medium text-[#0F766E] inline-flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#0F766E]" />
                Hours: {company.service_from}–{company.service_until}
              </span>
              <span className="h-11 px-3.5 rounded-[6px] bg-[#FFFBEB] border border-[#FDE68A] text-sm font-semibold text-[#B45309] inline-flex items-center gap-1.5">
                <Star className="h-4 w-4 text-[#F59E0B] fill-[#F59E0B]" />
                {company.rating.toFixed(1)}
              </span>
            </>
          )}
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="ui-btn-secondary ui-focus px-4 text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin text-[#0F766E]" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="ui-alert-error p-4 text-sm text-[#991B1B]">
          {loadError}
        </div>
      )}

      {changeNotice && (
        <div className="ui-alert-success p-4 flex items-start gap-2.5">
          <CheckCircle2 className="h-5 w-5 text-[#16A34A] shrink-0 mt-0.5" />
          <p className="text-sm text-[#166534]">{changeNotice}</p>
        </div>
      )}

      {pendingChanges.length > 0 && (
        <div className="ui-card ui-top-amber space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
            <div className="flex items-center gap-2.5">
              <span className="h-8 w-8 ui-icon-circle ui-icon-amber">
                <CalendarClock className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-bold text-[#0F172A]">
                Pending Flight &amp; Pickup Change Requests
              </h2>
              <span className="ui-badge ui-badge-pending">
                {pendingChanges.length} pending
              </span>
            </div>
            <span className="text-xs font-mono text-[#64748B]">Rule R9 · M7</span>
          </div>

          <div className="space-y-4">
            {pendingChanges.map((chg) => {
              const chgErr = changeErrors[chg.change_id];
              const isBusyDeciding = decidingChangeId === chg.change_id;

              return (
                <div
                  key={chg.change_id}
                  className="bg-[#FFFBEB]/60 border border-[#FDE68A] rounded-[8px] p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-[6px] bg-white border border-[#FDE68A] text-[#92400E]">
                        {chg.change_id}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenBooking(chg.booking_number)}
                        className="font-mono text-sm font-semibold text-[#4F46E5] hover:text-[#4338CA] hover:underline cursor-pointer"
                      >
                        Booking #{chg.booking_number}
                      </button>
                      {chg.booking && (
                        <span className="ui-badge ui-badge-teal font-mono">
                          Car {chg.booking.vehicle_id}
                        </span>
                      )}
                    </div>
                    {chg.hotel && (
                      <span className="text-sm text-[#64748B]">
                        {chg.hotel.name} · {chg.hotel.city} ({chg.hotel.area})
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-3.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B] block mb-1">
                        Current Confirmed Slot
                      </span>
                      <p className="font-medium text-[#0F172A]">
                        Flight {chg.prev_flight_id}
                        {chg.prev_flight ? ` (${chg.prev_flight.from} → ${chg.prev_flight.to})` : ""}
                      </p>
                      <p className="font-mono text-xs text-[#64748B] mt-1">
                        Pickup: {formatDateTimeLabel(chg.prev_pickup)}
                      </p>
                    </div>

                    <div className="bg-white border border-[#FCD34D] rounded-[6px] p-3.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#B45309] block mb-1">
                        Requested New Slot
                      </span>
                      <p className="font-medium text-[#0F172A]">
                        Flight {chg.new_flight_id}
                        {chg.new_flight ? ` (${chg.new_flight.from} → ${chg.new_flight.to})` : ""}
                      </p>
                      <p className="font-mono text-xs text-[#0F172A] mt-1">
                        New Pickup: {formatDateTimeLabel(chg.new_pickup)}
                      </p>
                      <p className="font-mono text-xs text-[#64748B] mt-0.5">
                        Car Busy Window: {chg.new_busy_start.slice(11, 16)}–{chg.new_busy_end.slice(11, 16)}
                      </p>
                    </div>
                  </div>

                  {chgErr && (
                    <div className="ui-alert-error p-3.5 space-y-1">
                      <span className="text-xs font-semibold text-[#DC2626] block">
                        {chgErr.rule ? `Rule ${chgErr.rule} Refused` : "Cannot Accept Change"}
                      </span>
                      <p className="text-sm text-[#991B1B]">{chgErr.message}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={isBusyDeciding}
                      onClick={() => void handleChangeDecision(chg.change_id, "ACCEPT")}
                      className="ui-btn-teal ui-focus-teal px-5 text-sm inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Accept Change</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusyDeciding}
                      onClick={() => void handleChangeDecision(chg.change_id, "REJECT")}
                      className="ui-btn-secondary ui-focus px-5 text-sm inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <XCircle className="h-4 w-4 text-[#DC2626]" />
                      <span>Reject &amp; Keep Original</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-5">
          <div className="ui-card flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">
                Open Requests You Can Serve ({servableRequests.length})
              </h2>
              <p className="text-sm text-[#64748B] mt-0.5">
                Filtered by Rule R4: matching arrival airport, hotel zone, operating hours, and fitting free car.
              </p>
            </div>
            <span className="ui-badge ui-badge-teal font-mono">M2 · M3 · R7</span>
          </div>

          {isLoading && !dashboard && (
            <div className="space-y-4">
              {[0, 1].map((idx) => (
                <div key={idx} className="ui-card space-y-3">
                  <div className="h-5 w-48 skeleton-bar" />
                  <div className="h-4 w-72 skeleton-bar" />
                  <div className="h-11 w-full skeleton-bar" />
                </div>
              ))}
            </div>
          )}

          {dashboard && servableRequests.length === 0 && (
            <div className="ui-card text-center py-10">
              <p className="text-base font-semibold text-[#0F172A]">
                No open ride requests match your company right now
              </p>
              <p className="text-sm text-[#64748B] mt-1.5 max-w-md mx-auto">
                Only open requests matching {company?.name}&apos;s airports ({company?.airports.join(", ")}), hotel areas, operating hours, and available fleet appear here (R4).
              </p>
            </div>
          )}

          <div className="space-y-5">
            {servableRequests.map((item) => {
              const reqId = item.request.request_id;
              const draft = drafts[reqId] ?? buildInitialDraft(item);
              const selectedEval = item.vehicle_evaluations.find(
                (ev) => ev.vehicle.vehicle_id === draft.vehicleId
              );
              const errBanner = offerErrors[reqId];
              const okBanner = offerSuccess[reqId];
              const isSubmitting = submittingReqId === reqId;

              return (
                <div key={reqId} className="ui-card ui-card-hover ui-top-teal space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E2E8F0] pb-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-[6px] bg-[#CCFBF1] border border-[#99F6E4] text-[#0F766E]">
                          {reqId}
                        </span>
                        <span className="text-lg font-bold text-[#0F172A]">
                          {item.request.traveler_name}
                        </span>
                        <span className="ui-badge ui-badge-open">OPEN</span>
                        {item.request.car_type && (
                          <span className="ui-badge ui-badge-accent font-mono">
                            Requires {item.request.car_type}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-[#64748B] block">Traveler&apos;s Price</span>
                      <span className="font-mono text-xl font-bold text-[#0F172A] block">
                        {formatInr(item.request.price_inr)}
                      </span>
                      <span className="font-mono text-xs text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] px-2.5 py-0.5 rounded-full font-semibold inline-block mt-1">
                        Allowed: {formatInr(item.route.price_min_inr)}–{formatInr(item.route.price_max_inr)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm">
                    <div className="flex items-start gap-2.5">
                      <span className="h-7 w-7 ui-icon-circle ui-icon-indigo mt-0.5">
                        <PlaneLanding className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <span className="font-medium text-[#0F172A] block">
                          {item.flight.flight_id} ({item.flight.from} → {item.flight.to})
                        </span>
                        <span className="font-mono text-xs text-[#64748B]">
                          Lands {formatDateTimeLabel(item.flight.arrival_local)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="h-7 w-7 ui-icon-circle ui-icon-teal mt-0.5">
                        <MapPin className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <span className="font-medium text-[#0F172A] block">
                          {item.hotel.name}
                        </span>
                        <span className="text-xs text-[#64748B]">
                          {item.hotel.city} · {item.hotel.area} ({item.route.drive_minutes}m drive)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="h-7 w-7 ui-icon-circle ui-icon-amber mt-0.5">
                        <Clock className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <span className="font-mono text-xs sm:text-sm font-medium text-[#0F172A] block">
                          Pickup {formatDateTimeLabel(item.request.pickup)}
                        </span>
                        <span className="font-mono text-xs text-[#64748B]">
                          Busy {item.busy_window.start.slice(11, 16)}–{item.busy_window.end.slice(11, 16)} (round-trip R6)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="h-7 w-7 ui-icon-circle ui-icon-indigo mt-0.5">
                        <Users className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <span className="text-[#0F172A] font-medium block">
                          {item.request.adults} adult{item.request.adults === 1 ? "" : "s"}
                          {item.request.child_ages.length > 0
                            ? ` + ${item.request.child_ages.length} child (${item.request.child_ages.join(", ")}y)`
                            : ""}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-[#64748B]">
                          <Luggage className="h-3.5 w-3.5" />
                          {item.request.large_bags} large · {item.request.small_bags} small bags
                        </span>
                      </div>
                    </div>
                  </div>

                  {item.existing_offers.length > 0 && (
                    <div className="bg-[#F0FDFA] border border-[#99F6E4] rounded-[8px] p-3.5 space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#0F766E] block">
                        Your Assigned Cars on {reqId} ({item.existing_offers.length})
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {item.existing_offers.map((ofr) => (
                          <div
                            key={ofr.offer_id}
                            className="inline-flex items-center gap-2 bg-white border border-[#CBD5E1] rounded-[6px] px-3 py-1.5 text-xs"
                          >
                            <span className="font-mono font-semibold text-[#0F172A]">
                              {ofr.vehicle_id}
                            </span>
                            <span className="font-mono text-[#0F766E] font-semibold">
                              {formatInr(ofr.price_inr)}
                            </span>
                            <span className={getOfferBadgeClass(ofr.status)}>
                              {ofr.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {errBanner && (
                    <div className="ui-alert-error p-4 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#DC2626]">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          {errBanner.rule ? `Rule ${errBanner.rule} Refused` : "Assignment Refused"}
                        </span>
                        {errBanner.code && (
                          <span className="font-mono text-xs text-[#991B1B]">
                            {errBanner.code}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[#991B1B] leading-relaxed">
                        {errBanner.message}
                      </p>
                    </div>
                  )}

                  {okBanner && (
                    <div className="ui-alert-success p-4 flex items-start gap-2.5">
                      <CheckCircle2 className="h-5 w-5 text-[#16A34A] shrink-0 mt-0.5" />
                      <p className="text-sm text-[#166534]">{okBanner}</p>
                    </div>
                  )}

                  <form
                    onSubmit={(e) => void handleAssignCar(e, item)}
                    noValidate
                    className="pt-4 border-t border-[#E2E8F0] space-y-4"
                  >
                    <div>
                      <label
                        htmlFor={`vehicle-select-${reqId}`}
                        className="block text-sm font-medium text-[#0F172A] mb-1.5"
                      >
                        Select Vehicle to Assign (G1: multiple cars allowed)
                      </label>
                      <div className="relative ui-input-wrap">
                        <select
                          id={`vehicle-select-${reqId}`}
                          value={draft.vehicleId}
                          onChange={(e) => updateDraft(item, { vehicleId: e.target.value })}
                          className="w-full h-full appearance-none bg-transparent pl-3.5 pr-9 text-sm text-[#0F172A] focus:outline-none cursor-pointer"
                        >
                          {item.vehicle_evaluations.map((ev) => {
                            const v = ev.vehicle;
                            let statusSuffix = "Fits & Free";
                            if (ev.already_offered_open) {
                              statusSuffix = "Already offered (OPEN)";
                            }
                            else if (!ev.eligible) {
                              statusSuffix = `Breaks ${ev.broken_rule ?? "Rule"}`;
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
                        <ChevronDown className="h-4 w-4 text-[#0F766E] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>

                      {selectedEval && !selectedEval.eligible && selectedEval.reason && (
                        <p className="text-xs text-[#B45309] mt-1.5">
                          Note: {selectedEval.reason} (Kept selectable so you can verify backend Rule {selectedEval.broken_rule} refusal).
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label
                            htmlFor={`offer-price-${reqId}`}
                            className="text-sm font-medium text-[#0F172A]"
                          >
                            Your Offer Price (INR · R3)
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              updateDraft(item, { priceInr: String(item.request.price_inr) })
                            }
                            className="text-xs font-semibold text-[#0F766E] hover:text-[#115E59] hover:underline cursor-pointer"
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
                            placeholder="Enter INR price"
                            className="ui-input w-full pl-9 pr-3.5 font-mono text-base"
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor={`offer-expiry-${reqId}`}
                          className="block text-sm font-medium text-[#0F172A] mb-1.5"
                        >
                          Offer Expiry (Optional · G4)
                        </label>
                        <div className="relative ui-input-wrap">
                          <select
                            id={`offer-expiry-${reqId}`}
                            value={draft.expirySeconds}
                            onChange={(e) =>
                              updateDraft(item, { expirySeconds: e.target.value })
                            }
                            className="w-full h-full appearance-none bg-transparent pl-3.5 pr-9 text-sm text-[#0F172A] focus:outline-none cursor-pointer"
                          >
                            <option value="" className="bg-white text-[#0F172A]">
                              No expiry
                            </option>
                            <option value="30" className="bg-white text-[#0F172A]">
                              Expire in 30 seconds (Demo)
                            </option>
                            <option value="120" className="bg-white text-[#0F172A]">
                              Expire in 2 minutes
                            </option>
                            <option value="900" className="bg-white text-[#0F172A]">
                              Expire in 15 minutes
                            </option>
                          </select>
                          <ChevronDown className="h-4 w-4 text-[#0F766E] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="ui-btn-teal ui-focus-teal w-full px-5 text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <span>{isSubmitting ? "Assigning Car..." : "Assign Car & Send Offer"}</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="ui-card ui-top-teal space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
              <div className="flex items-center gap-2.5">
                <span className="h-8 w-8 ui-icon-circle ui-icon-teal">
                  <Clock className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-[#0F172A]">
                    Fleet Schedule &amp; Busy Windows
                  </h2>
                  <p className="text-xs text-[#64748B]">
                    Combined pre-booked rides and confirmed bookings (R6 · S2).
                  </p>
                </div>
              </div>
              <span className="ui-badge ui-badge-teal font-mono">
                {fleetTimeline.length} cars
              </span>
            </div>

            <div className="space-y-3">
              {fleetTimeline.map((entry) => {
                const v = entry.vehicle;
                const hasBlocks = entry.busy_slots.length > 0;

                return (
                  <div
                    key={v.vehicle_id}
                    className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[8px] p-4 space-y-2.5"
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
                          ? `${entry.busy_slots.length} busy window${entry.busy_slots.length === 1 ? "" : "s"}`
                          : "Available"}
                      </span>
                    </div>

                    <p className="font-mono text-xs text-[#64748B]">
                      {v.seats} seats · {v.large_bags} large / {v.small_bags} small bags
                    </p>

                    {hasBlocks && (
                      <div className="space-y-1.5 pt-2 border-t border-[#E2E8F0]">
                        {entry.busy_slots.map((slot, idx) => (
                          <div
                            key={`${slot.reference_id}-${idx}`}
                            className="bg-white border border-[#E2E8F0] rounded-[6px] px-3 py-2 flex items-center justify-between gap-2 text-xs"
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
                                #{slot.reference_id}
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
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                <h2 className="text-lg font-bold text-[#0F172A]">
                  Confirmed Bookings ({myBookings.length})
                </h2>
                <span className="ui-badge ui-badge-booked">Active</span>
              </div>

              <div className="space-y-3">
                {myBookings.map((bk) => (
                  <div
                    key={bk.booking_number}
                    className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[8px] p-4 flex items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => onOpenBooking(bk.booking_number)}
                        className="font-mono text-sm font-bold text-[#4F46E5] hover:text-[#4338CA] hover:underline cursor-pointer block"
                      >
                        Booking #{bk.booking_number}
                      </button>
                      <p className="text-xs text-[#64748B]">
                        Car {bk.vehicle_id} · {bk.flight_id} · Pickup {formatDateTimeLabel(bk.pickup)}
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
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                <h2 className="text-lg font-bold text-[#0F172A]">
                  Submitted Offers ({myOffers.length})
                </h2>
              </div>

              <div className="space-y-2.5">
                {myOffers.map((ofr) => (
                  <div
                    key={ofr.offer_id}
                    className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-sm"
                  >
                    <div>
                      <span className="font-mono font-semibold text-[#0F172A]">
                        {ofr.vehicle_id}
                      </span>
                      <span className="text-[#64748B] mx-1.5">→</span>
                      <span className="font-mono text-xs text-[#64748B]">
                        {ofr.request_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-[#0F172A]">
                        {formatInr(ofr.price_inr)}
                      </span>
                      <span className={getOfferBadgeClass(ofr.status)}>
                        {ofr.status}
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
                <span>Service Coverage</span>
              </h2>
              <div>
                <span className="text-sm font-medium text-[#64748B] block mb-2">
                  Pickup Airports
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
                <span className="text-sm font-medium text-[#64748B] block mb-2">
                  Hotel Drop-off Areas ({company.areas.length})
                </span>
                <div className="flex flex-wrap gap-2">
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
