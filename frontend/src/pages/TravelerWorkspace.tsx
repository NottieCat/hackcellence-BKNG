import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  IndianRupee,
  Luggage,
  PlaneLanding,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  Users,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiRuleError,
  bookTaxiOffer,
  createRideRequest,
  fetchRequestDetail,
  fetchRideRequests,
  fetchRouteQuote,
  rejectTaxiOffer
} from "../api/client";
import type {
  BootstrapData,
  EnrichedRideRequest,
  OfferStatus,
  RequestDetailData,
  RouteQuoteData
} from "../api/client";
import {
  ClickSparkButton,
  CountUpInr,
  NudgeAlert,
  SpotlightCard
} from "../components/ui/MotionPrimitives";

interface TravelerWorkspaceProps {
  bootstrap: BootstrapData | null;
  onOpenBooking: (bookingNumber: string) => void;
  onSwitchToSupplier?: (companyId?: string) => void;
  onCatalogRefresh?: () => void;
}

interface BannerError {
  rule?: string;
  code: string;
  message: string;
}

type RequestTabFilter = "ALL" | "OPEN" | "BOOKED";

const SPRING_PILL = {
  type: "spring" as const,
  stiffness: 380,
  damping: 30
};

const CAR_TYPE_FILTERS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "HATCHBACK", label: "Hatchback" },
  { value: "SEDAN", label: "Sedan" },
  { value: "SUV", label: "SUV" },
  { value: "BUS", label: "Bus" }
];

function formatDateTimeLabel(isoHM: string): string {
  if (!isoHM || isoHM.length < 16) {
    return isoHM;
  }
  return `${isoHM.slice(0, 10)} · ${isoHM.slice(11, 16)}`;
}

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function getOfferStatusBadge(status: OfferStatus): { label: string; className: string } {
  if (status === "BOOKED") {
    return { label: "Booked", className: "ui-badge ui-badge-booked" };
  }
  if (status === "OPEN") {
    return { label: "Available", className: "ui-badge ui-badge-pending" };
  }
  if (status === "REJECTED") {
    return { label: "Declined", className: "ui-badge ui-badge-rejected" };
  }
  if (status === "NOT_CHOSEN") {
    return { label: "Not chosen", className: "ui-badge ui-badge-neutral" };
  }
  return { label: "Expired", className: "ui-badge ui-badge-neutral" };
}

function getOfferTopBorderClass(status: OfferStatus): string {
  if (status === "BOOKED") {
    return "ui-top-green";
  }
  if (status === "OPEN") {
    return "ui-top-teal";
  }
  return "border-t-[3px] border-t-[#CBD5E1]";
}

function formatExpiryCountdown(
  expiresAt: string | null,
  nowMs: number
): { text: string; expired: boolean } | null {
  if (!expiresAt) {
    return null;
  }
  const expiryMs = Date.parse(expiresAt);
  if (Number.isNaN(expiryMs)) {
    return null;
  }
  const remainingSec = Math.ceil((expiryMs - nowMs) / 1000);
  if (remainingSec <= 0) {
    return { text: "Offer expired", expired: true };
  }
  if (remainingSec < 60) {
    return { text: `Ends in ${remainingSec}s`, expired: false };
  }
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  return { text: `Ends in ${mins}m ${secs}s`, expired: false };
}

export function TravelerWorkspace({
  bootstrap,
  onOpenBooking,
  onSwitchToSupplier,
  onCatalogRefresh
}: TravelerWorkspaceProps) {
  const [airportFilter, setAirportFilter] = useState<string>("ALL");
  const [travelerName, setTravelerName] = useState<string>("");
  const [flightId, setFlightId] = useState<string>("");
  const [hotelId, setHotelId] = useState<string>("");
  const [adults, setAdults] = useState<string>("2");
  const [childAges, setChildAges] = useState<string[]>([]);
  const [largeBags, setLargeBags] = useState<string>("1");
  const [smallBags, setSmallBags] = useState<string>("1");
  const [pickup, setPickup] = useState<string>("");
  const [carType, setCarType] = useState<string>("");
  const [priceInr, setPriceInr] = useState<string>("");

  const [quote, setQuote] = useState<RouteQuoteData | null>(null);
  const [quoteError, setQuoteError] = useState<BannerError | null>(null);
  const [isQuoting, setIsQuoting] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<BannerError | null>(null);
  const [submitErrorSeq, setSubmitErrorSeq] = useState<number>(0);
  const [createdBanner, setCreatedBanner] = useState<string | null>(null);
  const [createdMatchingSupplierId, setCreatedMatchingSupplierId] = useState<string | undefined>(
    undefined
  );

  const [requests, setRequests] = useState<EnrichedRideRequest[]>([]);
  const [requestTab, setRequestTab] = useState<RequestTabFilter>("ALL");
  const [isLoadingRequests, setIsLoadingRequests] = useState<boolean>(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<RequestDetailData | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);

  const [offerSort, setOfferSort] = useState<string>("");
  const [offerCarTypeFilter, setOfferCarTypeFilter] = useState<string>("ALL");
  const [actionOfferId, setActionOfferId] = useState<string | null>(null);
  const [offerActionError, setOfferActionError] = useState<BannerError | null>(null);
  const [offerErrorSeq, setOfferErrorSeq] = useState<number>(0);
  const [offerActionSuccess, setOfferActionSuccess] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const airports = bootstrap?.airports ?? [];
  const allFlights = bootstrap?.flights ?? [];
  const allHotels = bootstrap?.hotels ?? [];

  const filteredFlights = useMemo(() => {
    if (airportFilter === "ALL") {
      return allFlights;
    }
    return allFlights.filter((flight) => flight.to === airportFilter);
  }, [allFlights, airportFilter]);

  const hotelsByCity = useMemo(() => {
    const grouped = new Map<string, typeof allHotels>();
    for (const hotel of allHotels) {
      const list = grouped.get(hotel.city) ?? [];
      list.push(hotel);
      grouped.set(hotel.city, list);
    }
    return Array.from(grouped.entries());
  }, [allHotels]);

  const visibleRequests = useMemo(() => {
    if (requestTab === "ALL") {
      return requests;
    }
    return requests.filter((req) => req.status === requestTab);
  }, [requests, requestTab]);

  const loadRequests = useCallback(async () => {
    setIsLoadingRequests(true);
    setRequestsError(null);

    try {
      const response = await fetchRideRequests();
      setRequests(response.requests);
    }
    catch (err) {
      if (err instanceof ApiRuleError) {
        setRequestsError(err.message);
      }
      else {
        setRequestsError("Unable to load ride requests right now.");
      }
    }
    finally {
      setIsLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (!flightId || !hotelId) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    let cancelled = false;
    setIsQuoting(true);
    setQuoteError(null);

    fetchRouteQuote(flightId, hotelId)
      .then((data) => {
        if (!cancelled) {
          setQuote(data);
          setQuoteError(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setQuote(null);
        if (err instanceof ApiRuleError) {
          setQuoteError({
            rule: err.rule,
            code: err.code,
            message: err.message
          });
        }
        else {
          setQuoteError({
            code: "QUOTE_FAILED",
            message: "Unable to calculate route fare guidance."
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsQuoting(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [flightId, hotelId]);

  function handlePrefillSampleTrip(): void {
    setAirportFilter("ALL");
    setTravelerName("Menon Family");
    setFlightId("FL-401");
    setHotelId("HTL-TYO-004");
    setAdults("2");
    setChildAges(["6"]);
    setLargeBags("3");
    setSmallBags("2");
    setPickup("2027-04-10T11:30");
    setCarType("");
    setPriceInr("12000");
    setSubmitError(null);
    setCreatedBanner(null);
  }

  function handleAddChild(): void {
    setChildAges((prev) => [...prev, "6"]);
  }

  function handleUpdateChildAge(index: number, value: string): void {
    setChildAges((prev) => prev.map((age, i) => (i === index ? value : age)));
  }

  function handleRemoveChild(index: number): void {
    setChildAges((prev) => prev.filter((_, i) => i !== index));
  }

  const loadRequestDetail = useCallback(
    async (
      requestId: string,
      sortValue: string,
      carTypeValue: string,
      silent = false
    ) => {
      if (!silent) {
        setIsLoadingDetail(true);
      }

      try {
        const detail = await fetchRequestDetail(requestId, {
          sort: sortValue || undefined,
          carType: carTypeValue === "ALL" ? undefined : carTypeValue
        });
        setExpandedDetail(detail);
        setNowMs(Date.now());
      }
      catch {
        if (!silent) {
          setExpandedDetail(null);
        }
      }
      finally {
        if (!silent) {
          setIsLoadingDetail(false);
        }
      }
    },
    []
  );

  const hasExpiringOpenOffer = Boolean(
    expandedDetail?.offers.some(
      (offer) => offer.status === "OPEN" && Boolean(offer.expires_at)
    )
  );

  useEffect(() => {
    if (!hasExpiringOpenOffer) {
      return;
    }

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [hasExpiringOpenOffer]);

  async function handleToggleRequestDetail(requestId: string): Promise<void> {
    if (expandedRequestId === requestId) {
      setExpandedRequestId(null);
      setExpandedDetail(null);
      setOfferActionError(null);
      setOfferActionSuccess(null);
      return;
    }

    setExpandedRequestId(requestId);
    setExpandedDetail(null);
    setOfferSort("");
    setOfferCarTypeFilter("ALL");
    setOfferActionError(null);
    setOfferActionSuccess(null);
    await loadRequestDetail(requestId, "", "ALL", false);
  }

  function handleOfferSortChange(nextSort: string): void {
    setOfferSort(nextSort);
    setOfferActionError(null);
    if (expandedRequestId) {
      void loadRequestDetail(expandedRequestId, nextSort, offerCarTypeFilter, false);
    }
  }

  function handleOfferCarTypeChange(nextCarType: string): void {
    setOfferCarTypeFilter(nextCarType);
    setOfferActionError(null);
    if (expandedRequestId) {
      void loadRequestDetail(expandedRequestId, offerSort, nextCarType, false);
    }
  }

  async function handleRejectOffer(offerId: string): Promise<void> {
    if (!expandedRequestId) {
      return;
    }

    setActionOfferId(offerId);
    setOfferActionError(null);
    setOfferActionSuccess(null);

    try {
      await rejectTaxiOffer(offerId);
      setOfferActionSuccess("Vehicle offer declined. Other quotes remain open.");
      await Promise.all([
        loadRequests(),
        loadRequestDetail(expandedRequestId, offerSort, offerCarTypeFilter, true)
      ]);
      if (onCatalogRefresh) {
        onCatalogRefresh();
      }
    }
    catch (err) {
      setOfferErrorSeq((n) => n + 1);
      if (err instanceof ApiRuleError) {
        setOfferActionError({
          rule: err.rule,
          code: err.code,
          message: err.message
        });
      }
      else {
        setOfferActionError({
          code: "REJECT_FAILED",
          message: "Unable to decline this taxi offer."
        });
      }
      await Promise.all([
        loadRequests(),
        loadRequestDetail(expandedRequestId, offerSort, offerCarTypeFilter, true)
      ]);
    }
    finally {
      setActionOfferId(null);
    }
  }

  async function handleBookOffer(offerId: string): Promise<void> {
    if (!expandedRequestId) {
      return;
    }

    setActionOfferId(offerId);
    setOfferActionError(null);
    setOfferActionSuccess(null);

    try {
      const booked = await bookTaxiOffer(offerId);
      await loadRequests();
      if (onCatalogRefresh) {
        onCatalogRefresh();
      }
      onOpenBooking(booked.booking.booking_number);
    }
    catch (err) {
      setOfferErrorSeq((n) => n + 1);
      if (err instanceof ApiRuleError) {
        setOfferActionError({
          rule: err.rule,
          code: err.code,
          message: err.message
        });
      }
      else {
        setOfferActionError({
          code: "BOOK_FAILED",
          message: "Unable to confirm taxi booking."
        });
      }
      await Promise.all([
        loadRequests(),
        loadRequestDetail(expandedRequestId, offerSort, offerCarTypeFilter, true)
      ]);
    }
    finally {
      setActionOfferId(null);
    }
  }

  async function handleSubmitRequest(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitError(null);
    setCreatedBanner(null);
    setCreatedMatchingSupplierId(undefined);
    setIsSubmitting(true);

    try {
      const parsedChildAges = childAges.map((raw) => (raw.trim() === "" ? NaN : Number(raw)));
      const parsedPrice = priceInr.trim() === "" ? NaN : Number(priceInr);

      const result = await createRideRequest({
        traveler_name: travelerName.trim() || "Guest Traveler",
        flight_id: flightId,
        hotel_id: hotelId,
        adults: adults.trim() === "" ? NaN : Number(adults),
        child_ages: parsedChildAges,
        large_bags: largeBags.trim() === "" ? NaN : Number(largeBags),
        small_bags: smallBags.trim() === "" ? NaN : Number(smallBags),
        pickup: pickup.trim() || undefined,
        car_type: carType || null,
        price_inr: parsedPrice
      });

      const firstMatchingSupplier = result.servability.servable_company_ids[0];
      setCreatedMatchingSupplierId(firstMatchingSupplier);

      const matchSummary =
        result.servability.servable_count > 0
          ? `Broadcast to ${result.servability.servable_count} matching local fleet${
              result.servability.servable_count === 1 ? "" : "s"
            }.`
          : "Saved, though no local fleet currently covers this schedule or airport.";

      setCreatedBanner(
        `Trip ${result.request.request_id} posted at ${formatInr(result.request.price_inr)}. ${matchSummary}`
      );

      setRequestTab("ALL");
      await loadRequests();
      setExpandedRequestId(result.request.request_id);
      setOfferSort("");
      setOfferCarTypeFilter("ALL");
      setOfferActionError(null);
      setOfferActionSuccess(null);
      const detail = await fetchRequestDetail(result.request.request_id);
      setExpandedDetail(detail);

      if (onCatalogRefresh) {
        onCatalogRefresh();
      }
    }
    catch (err) {
      setSubmitErrorSeq((n) => n + 1);
      if (err instanceof ApiRuleError) {
        setSubmitError({
          rule: err.rule,
          code: err.code,
          message: err.message
        });
      }
      else {
        setSubmitError({
          code: "NETWORK_ERROR",
          message: "Failed to submit ride request to AeroCab service."
        });
      }
    }
    finally {
      setIsSubmitting(false);
    }
  }

  const priceMeterState = useMemo(() => {
    if (!quote) {
      return {
        percent: 50,
        statusLabel: "Select flight & hotel",
        inRange: true
      };
    }

    const val = Number(priceInr);
    if (!Number.isFinite(val) || priceInr.trim() === "") {
      return {
        percent: 50,
        statusLabel: "Enter your offer fare",
        inRange: true
      };
    }

    const span = quote.price_max_inr - quote.price_min_inr;
    const rawPct = span > 0 ? ((val - quote.price_min_inr) / span) * 100 : 100;
    const clampedPct = Math.min(100, Math.max(4, Math.round(rawPct)));

    if (val < quote.price_min_inr) {
      return {
        percent: 4,
        statusLabel: "Below route minimum",
        inRange: false
      };
    }
    if (val > quote.price_max_inr) {
      return {
        percent: 100,
        statusLabel: "Above route maximum",
        inRange: false
      };
    }
    return {
      percent: clampedPct,
      statusLabel: "Within fair route range",
      inRange: true
    };
  }, [quote, priceInr]);

  const openCount = useMemo(
    () => requests.filter((r) => r.status === "OPEN").length,
    [requests]
  );
  const bookedCount = useMemo(
    () => requests.filter((r) => r.status === "BOOKED").length,
    [requests]
  );

  return (
    <section className="space-y-7">
      <div className="ui-card ui-top-indigo flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 ui-icon-circle ui-icon-indigo border border-[#C7D2FE] mt-0.5">
            <PlaneLanding className="h-6 w-6 stroke-[1.8]" />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#4F46E5] block mb-1">
              Passenger Concierge
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A]">
              Plan Your Airport Transfer
            </h1>
            <p className="text-sm sm:text-base text-[#475569] mt-1">
              Set your arrival flight, hotel, and preferred fare. Compare verified fleet quotes side by side and book with one click.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handlePrefillSampleTrip}
          className="ui-btn-secondary ui-focus px-4 text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer"
        >
          <Sparkles className="h-4 w-4 text-[#4F46E5]" />
          <span>Fill Sample Tokyo Trip</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
        <div className="lg:col-span-5 ui-card ui-top-indigo">
          <div className="flex items-center justify-between border-b border-[#E5E9F2] pb-4 mb-5">
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">
                Request a Pickup
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Instant route validation &amp; live INR fare guidance
              </p>
            </div>
            <span className="ui-badge ui-badge-accent">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Verified Route</span>
            </span>
          </div>

          <AnimatePresence mode="wait">
            {submitError && (
              <NudgeAlert
                triggerKey={`submit-err-${submitErrorSeq}`}
                className="mb-5 ui-alert-error p-4 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#BE123C]">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                      {submitError.rule
                        ? `Unable to post (${submitError.rule})`
                        : "Check request details"}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-[#9F1239]">
                    {submitError.code}
                  </span>
                </div>
                <p className="text-sm text-[#9F1239] leading-relaxed">
                  {submitError.message}
                </p>
              </NudgeAlert>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {createdBanner && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="mb-5 ui-alert-success p-4 space-y-2.5"
              >
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-[#059669] shrink-0 mt-0.5" />
                  <p className="text-sm text-[#065F46] leading-relaxed">
                    {createdBanner}
                  </p>
                </div>
                {onSwitchToSupplier && createdMatchingSupplierId && (
                  <button
                    type="button"
                    onClick={() => onSwitchToSupplier(createdMatchingSupplierId)}
                    className="text-xs font-semibold text-[#0F766E] hover:text-[#115E59] hover:underline inline-flex items-center gap-1.5 cursor-pointer pl-7"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>Open matching Operator Desk to assign a taxi →</span>
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={(e) => void handleSubmitRequest(e)} noValidate className="space-y-5">
            <div>
              <label
                htmlFor="traveler-name"
                className="block text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1.5"
              >
                Passenger or Group Name
              </label>
              <input
                id="traveler-name"
                type="text"
                value={travelerName}
                onChange={(e) => setTravelerName(e.target.value)}
                placeholder="e.g. Menon Family"
                className="ui-input w-full px-3.5 text-sm sm:text-base placeholder:text-[#94A3B8]"
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <label
                  htmlFor="flight-select"
                  className="text-xs font-semibold uppercase tracking-wider text-[#475569]"
                >
                  Arrival Flight
                </label>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setAirportFilter("ALL")}
                    className={`px-2 py-0.5 rounded-[6px] font-mono text-[11px] border cursor-pointer ui-interactive ${
                      airportFilter === "ALL"
                        ? "bg-[#4F46E5] text-white border-[#4F46E5] font-semibold"
                        : "bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0] hover:bg-[#EEF2FF] hover:text-[#4F46E5]"
                    }`}
                  >
                    ALL
                  </button>
                  {airports.map((airport) => (
                    <button
                      key={airport.code}
                      type="button"
                      onClick={() => setAirportFilter(airport.code)}
                      className={`px-2 py-0.5 rounded-[6px] font-mono text-[11px] border cursor-pointer ui-interactive ${
                        airportFilter === airport.code
                          ? "bg-[#4F46E5] text-white border-[#4F46E5] font-semibold"
                          : "bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0] hover:bg-[#EEF2FF] hover:text-[#4F46E5]"
                      }`}
                    >
                      {airport.code}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative ui-input-wrap">
                <select
                  id="flight-select"
                  value={flightId}
                  onChange={(e) => setFlightId(e.target.value)}
                  className="w-full h-full appearance-none bg-transparent pl-3.5 pr-9 text-sm text-[#0F172A] focus:outline-none cursor-pointer"
                >
                  <option value="" className="bg-white text-[#64748B]">
                    Choose arrival flight ({filteredFlights.length} available)...
                  </option>
                  {filteredFlights.map((flight) => (
                    <option
                      key={flight.flight_id}
                      value={flight.flight_id}
                      className="bg-white text-[#0F172A]"
                    >
                      {flight.flight_id} · {flight.from} → {flight.to} · Lands {formatDateTimeLabel(flight.arrival_local)} ({flight.airline})
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 text-[#4F46E5] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label
                htmlFor="hotel-select"
                className="block text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1.5"
              >
                Destination Hotel
              </label>
              <div className="relative ui-input-wrap">
                <select
                  id="hotel-select"
                  value={hotelId}
                  onChange={(e) => setHotelId(e.target.value)}
                  className="w-full h-full appearance-none bg-transparent pl-3.5 pr-9 text-sm text-[#0F172A] focus:outline-none cursor-pointer"
                >
                  <option value="" className="bg-white text-[#64748B]">
                    Choose destination hotel ({allHotels.length} partner hotels)...
                  </option>
                  {hotelsByCity.map(([city, cityHotels]) => (
                    <optgroup
                      key={city}
                      label={`${city} (${cityHotels.length})`}
                      className="bg-white text-[#64748B]"
                    >
                      {cityHotels.map((hotel) => (
                        <option
                          key={hotel.hotel_id}
                          value={hotel.hotel_id}
                          className="bg-white text-[#0F172A]"
                        >
                          {hotel.name} · {hotel.area}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 text-[#4F46E5] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {isQuoting && (
              <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[10px] p-3.5 text-xs font-medium text-[#92400E] flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#D97706]" />
                <span>Checking route distance &amp; recommended fare range...</span>
              </div>
            )}

            <AnimatePresence mode="wait">
              {quoteError && !isQuoting && (
                <NudgeAlert
                  triggerKey={`${flightId}-${hotelId}-${quoteError.code}`}
                  className="ui-alert-error p-4 space-y-1"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#BE123C] block">
                    {quoteError.rule ? `Route Mismatch (${quoteError.rule})` : "Route Unavailable"}
                  </span>
                  <p className="text-sm text-[#9F1239] leading-relaxed">
                    {quoteError.message}
                  </p>
                </NudgeAlert>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {quote && !isQuoting && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="ui-alert-info p-4 space-y-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#92400E]">
                      <span className="h-6 w-6 ui-icon-circle ui-icon-amber">
                        <IndianRupee className="h-3.5 w-3.5" />
                      </span>
                      <span>Recommended Route Fare</span>
                    </span>
                    <span className="text-base font-bold text-[#B45309]">
                      <CountUpInr value={quote.price_min_inr} /> –{" "}
                      <CountUpInr value={quote.price_max_inr} />
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="relative h-2.5 w-full rounded-full bg-[#FDE68A]/80">
                      <motion.div
                        animate={{ width: `${priceMeterState.percent}%` }}
                        transition={{ type: "spring", stiffness: 320, damping: 28 }}
                        className={`h-full rounded-full ${
                          priceMeterState.inRange ? "bg-[#F59E0B]" : "bg-[#E11D48]"
                        }`}
                      />
                      <motion.span
                        animate={{ left: `${priceMeterState.percent}%` }}
                        transition={{ type: "spring", stiffness: 320, damping: 28 }}
                        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-white border-2 shadow-sm ${
                          priceMeterState.inRange ? "border-[#D97706]" : "border-[#E11D48]"
                        }`}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-medium">
                      <span className="font-mono text-[#92400E]">
                        Min {formatInr(quote.price_min_inr)}
                      </span>
                      <span
                        className={
                          priceMeterState.inRange
                            ? "text-[#B45309] font-semibold"
                            : "text-[#BE123C] font-semibold"
                        }
                      >
                        {priceMeterState.statusLabel}
                      </span>
                      <span className="font-mono text-[#92400E]">
                        Max {formatInr(quote.price_max_inr)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-[#FDE68A] text-xs">
                    <div>
                      <span className="text-[#92400E] block mb-0.5">Earliest Pickup</span>
                      <span className="font-mono font-semibold text-[#0F172A]">
                        {formatDateTimeLabel(quote.earliest_pickup)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#92400E] block mb-0.5">Estimated Transfer</span>
                      <span className="font-mono font-semibold text-[#0F172A]">
                        {quote.drive_minutes} min · {quote.distance_km} km
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[11px] font-semibold text-[#92400E] mr-1">
                      Quick fill:
                    </span>
                    <button
                      type="button"
                      onClick={() => setPriceInr(String(quote.price_min_inr))}
                      className="px-2.5 py-1 rounded-[7px] bg-white border border-[#FCD34D] hover:border-[#F59E0B] hover:bg-[#FEF3C7] font-mono text-xs font-medium text-[#92400E] cursor-pointer ui-interactive"
                    >
                      Min {formatInr(quote.price_min_inr)}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPriceInr(
                          String(Math.round((quote.price_min_inr + quote.price_max_inr) / 2))
                        )
                      }
                      className="px-2.5 py-1 rounded-[7px] bg-white border border-[#FCD34D] hover:border-[#F59E0B] hover:bg-[#FEF3C7] font-mono text-xs font-medium text-[#92400E] cursor-pointer ui-interactive"
                    >
                      Mid {formatInr(Math.round((quote.price_min_inr + quote.price_max_inr) / 2))}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriceInr(String(quote.price_max_inr))}
                      className="px-2.5 py-1 rounded-[7px] bg-white border border-[#FCD34D] hover:border-[#F59E0B] hover:bg-[#FEF3C7] font-mono text-xs font-medium text-[#92400E] cursor-pointer ui-interactive"
                    >
                      Max {formatInr(quote.price_max_inr)}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="adults-input"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1.5"
                >
                  Adults
                </label>
                <input
                  id="adults-input"
                  type="number"
                  value={adults}
                  onChange={(e) => setAdults(e.target.value)}
                  className="ui-input w-full px-3 font-mono text-base"
                />
              </div>

              <div>
                <label
                  htmlFor="large-bags-input"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1.5"
                >
                  Large Bags
                </label>
                <input
                  id="large-bags-input"
                  type="number"
                  value={largeBags}
                  onChange={(e) => setLargeBags(e.target.value)}
                  className="ui-input w-full px-3 font-mono text-base"
                />
              </div>

              <div>
                <label
                  htmlFor="small-bags-input"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1.5"
                >
                  Small Bags
                </label>
                <input
                  id="small-bags-input"
                  type="number"
                  value={smallBags}
                  onChange={(e) => setSmallBags(e.target.value)}
                  className="ui-input w-full px-3 font-mono text-base"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
                  Children&apos;s Ages (0–17 yrs)
                </span>
                <button
                  type="button"
                  onClick={handleAddChild}
                  className="px-2.5 py-1 rounded-[7px] bg-[#EEF2FF] border border-[#C7D2FE] hover:bg-[#E0E7FF] text-xs font-semibold text-[#4338CA] inline-flex items-center gap-1 cursor-pointer ui-interactive"
                >
                  <Plus className="h-3.5 w-3.5 text-[#4F46E5]" />
                  <span>Add Child</span>
                </button>
              </div>

              <AnimatePresence initial={false}>
                {childAges.length === 0 ? (
                  <p className="text-xs text-[#64748B]">
                    Traveling with children? Add each child&apos;s age so vehicles match seat requirements.
                  </p>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex flex-wrap gap-2 pt-1 overflow-hidden"
                  >
                    {childAges.map((age, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, scale: 0.94 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.94 }}
                        transition={{ duration: 0.16 }}
                        className="inline-flex items-center bg-[#F8FAFC] border border-[#CBD5E1] rounded-[8px] h-10 overflow-hidden focus-within:border-[#4F46E5] focus-within:bg-white"
                      >
                        <span className="px-2.5 text-xs font-semibold text-[#4338CA] bg-[#EEF2FF] h-full inline-flex items-center border-r border-[#C7D2FE]">
                          Child {index + 1}
                        </span>
                        <input
                          type="number"
                          aria-label={`Child ${index + 1} age`}
                          value={age}
                          onChange={(e) => handleUpdateChildAge(index, e.target.value)}
                          className="w-14 h-full px-2 bg-transparent font-mono text-sm text-[#0F172A] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveChild(index)}
                          aria-label={`Remove child ${index + 1}`}
                          className="h-full px-2 text-[#64748B] hover:text-[#E11D48] hover:bg-[#FFF1F2] border-l border-[#E2E8F0] cursor-pointer ui-interactive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="pickup-input"
                  className="text-xs font-semibold uppercase tracking-wider text-[#475569]"
                >
                  Preferred Pickup Time (Optional)
                </label>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  {quote && (
                    <button
                      type="button"
                      onClick={() => setPickup(quote.earliest_pickup)}
                      className="text-[#4F46E5] hover:text-[#4338CA] hover:underline cursor-pointer"
                    >
                      Earliest {quote.earliest_pickup.slice(11, 16)}
                    </button>
                  )}
                  {pickup && (
                    <button
                      type="button"
                      onClick={() => setPickup("")}
                      className="text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
              <input
                id="pickup-input"
                type="datetime-local"
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                className="ui-input w-full px-3.5 font-mono text-sm"
              />
              <p className="text-xs text-[#64748B] mt-1.5">
                20 min to 3 hrs after landing. Leave blank to schedule 60 minutes after arrival.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="car-type-select"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1.5"
                >
                  Preferred Vehicle
                </label>
                <div className="relative ui-input-wrap">
                  <select
                    id="car-type-select"
                    value={carType}
                    onChange={(e) => setCarType(e.target.value)}
                    className="w-full h-full appearance-none bg-transparent pl-3.5 pr-8 text-sm text-[#0F172A] focus:outline-none cursor-pointer"
                  >
                    <option value="" className="bg-white text-[#0F172A]">
                      Any Vehicle Class
                    </option>
                    <option value="HATCHBACK" className="bg-white text-[#0F172A]">
                      Hatchback
                    </option>
                    <option value="SEDAN" className="bg-white text-[#0F172A]">
                      Sedan
                    </option>
                    <option value="SUV" className="bg-white text-[#0F172A]">
                      SUV
                    </option>
                    <option value="BUS" className="bg-white text-[#0F172A]">
                      Passenger Bus
                    </option>
                  </select>
                  <ChevronDown className="h-4 w-4 text-[#4F46E5] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label
                  htmlFor="price-input"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1.5"
                >
                  Your Offer Fare (INR)
                </label>
                <div className="relative">
                  <IndianRupee className="h-4 w-4 text-[#D97706] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="price-input"
                    type="number"
                    value={priceInr}
                    onChange={(e) => setPriceInr(e.target.value)}
                    placeholder="e.g. 12000"
                    className="ui-input w-full pl-9 pr-3.5 font-mono text-base placeholder:font-sans placeholder:text-[#94A3B8]"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="ui-btn-primary ui-focus w-full mt-2 px-5 text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span>{isSubmitting ? "Publishing Request..." : "Publish Ride Request"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 space-y-5">
          <div className="ui-card flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">
                Your Trip Requests &amp; Fleet Quotes
              </h2>
              <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
                Select any trip to compare assigned vehicles, sort by price, or open your 10-digit pass.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex items-center p-1 rounded-[9px] bg-[#F1F5F9] border border-[#E2E8F0]">
                {(
                  [
                    { id: "ALL", label: `All (${requests.length})` },
                    { id: "OPEN", label: `Open (${openCount})` },
                    { id: "BOOKED", label: `Booked (${bookedCount})` }
                  ] as Array<{ id: RequestTabFilter; label: string }>
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setRequestTab(tab.id)}
                    className={`relative px-2.5 py-1 rounded-[7px] text-xs font-semibold cursor-pointer transition-colors ${
                      requestTab === tab.id
                        ? "text-[#4338CA]"
                        : "text-[#64748B] hover:text-[#0F172A]"
                    }`}
                  >
                    {requestTab === tab.id && (
                      <motion.span
                        layoutId="traveler-req-tab"
                        transition={SPRING_PILL}
                        className="absolute inset-0 rounded-[7px] bg-white shadow-xs border border-[#C7D2FE]"
                      />
                    )}
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void loadRequests()}
                title="Refresh requests"
                aria-label="Refresh requests"
                className="ui-btn-ghost ui-focus w-10 inline-flex items-center justify-center cursor-pointer"
              >
                <RefreshCw
                  className={`h-4 w-4 ${
                    isLoadingRequests ? "animate-spin text-[#4F46E5]" : "text-[#475569]"
                  }`}
                />
              </button>
            </div>
          </div>

          {requestsError && (
            <div className="ui-alert-error p-4 text-sm text-[#BE123C]">
              {requestsError}
            </div>
          )}

          {isLoadingRequests && requests.length === 0 && (
            <div className="space-y-4">
              {[0, 1, 2].map((idx) => (
                <div key={idx} className="ui-card space-y-3">
                  <div className="h-5 w-44 skeleton-bar" />
                  <div className="h-4 w-72 skeleton-bar" />
                  <div className="h-12 w-full skeleton-bar" />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-4">
            {visibleRequests.map((item, idx) => {
              const isExpanded = expandedRequestId === item.request_id;
              const isZeroSuppliers =
                item.status === "OPEN" && item.servability.servable_count === 0;
              const firstEligibleSupplierId = item.servability.servable_company_ids[0];

              return (
                <motion.div
                  key={item.request_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.22,
                    delay: Math.min(idx * 0.03, 0.18),
                    ease: [0.22, 1, 0.36, 1]
                  }}
                  className={`ui-card-flush ui-card-hover ${
                    item.status === "BOOKED" ? "ui-top-green" : "ui-top-indigo"
                  } ${isExpanded ? "ring-2 ring-[#4F46E5]/18 border-[#A5B4FC]" : ""}`}
                >
                  <div className="p-5 sm:p-6 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-[#4338CA] px-2.5 py-0.5 rounded-[7px] bg-[#EEF2FF] border border-[#C7D2FE]">
                          {item.request_id}
                        </span>
                        <span className="text-base font-bold text-[#0F172A]">
                          {item.traveler_name}
                        </span>
                        <span
                          className={
                            item.status === "BOOKED"
                              ? "ui-badge ui-badge-booked"
                              : "ui-badge ui-badge-open"
                          }
                        >
                          {item.status === "BOOKED" ? "Booked" : "Open for Offers"}
                        </span>
                        {item.car_type && (
                          <span className="ui-badge ui-badge-accent font-mono">
                            {item.car_type}
                          </span>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="text-[11px] uppercase tracking-wider font-semibold text-[#64748B] block">
                          Offer Fare
                        </span>
                        <span className="font-mono text-lg font-bold text-[#0F172A] block">
                          {formatInr(item.price_inr)}
                        </span>
                        {item.route && (
                          <span className="font-mono text-[11px] text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] px-2 py-0.5 rounded-full inline-block mt-0.5">
                            Guide {formatInr(item.route.price_min_inr)}–{formatInr(item.route.price_max_inr)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="bg-[#F8FAFC] border border-[#E5E9F2] rounded-[11px] p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="h-8 w-8 ui-icon-circle ui-icon-indigo shrink-0">
                          <PlaneLanding className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] block">
                            Arrival Flight
                          </span>
                          <span className="truncate text-[#0F172A] font-semibold block">
                            {item.flight
                              ? `${item.flight.flight_id} · ${item.flight.from} → ${item.flight.to}`
                              : item.flight_id}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="h-8 w-8 ui-icon-circle ui-icon-teal shrink-0">
                          <Building2 className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] block">
                            Destination Hotel
                          </span>
                          <span className="truncate text-[#0F172A] font-semibold block">
                            {item.hotel
                              ? `${item.hotel.name} (${item.hotel.area})`
                              : item.hotel_id}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm text-[#475569]">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[#0F172A]">
                        <Clock className="h-4 w-4 text-[#D97706]" />
                        <span>Pickup {formatDateTimeLabel(item.pickup)}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-[#4F46E5]" />
                        <span>
                          {item.adults} adult{item.adults === 1 ? "" : "s"}
                          {item.child_ages.length > 0
                            ? ` + ${item.child_ages.length} child (${item.child_ages.join(", ")}y)`
                            : ""}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Luggage className="h-4 w-4 text-[#0D9488]" />
                        <span>
                          {item.large_bags} large · {item.small_bags} small bags
                        </span>
                      </span>
                    </div>

                    {isZeroSuppliers && (
                      <div className="ui-alert-error p-4 space-y-1.5">
                        <div className="flex items-center gap-2 text-sm font-semibold text-[#BE123C]">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>No local taxi operator can serve this request</span>
                        </div>
                        <ul className="space-y-1 pl-5 list-disc text-xs sm:text-sm text-[#9F1239]">
                          {item.servability.unservable_reasons.map((reason, rIdx) => (
                            <li key={rIdx}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="pt-3.5 border-t border-[#E5E9F2] flex flex-wrap items-center justify-between gap-3 text-sm">
                      <div>
                        {item.status === "BOOKED" && item.booking_number ? (
                          <button
                            type="button"
                            onClick={() => onOpenBooking(item.booking_number!)}
                            className="font-mono text-xs sm:text-sm font-semibold text-[#047857] bg-[#ECFDF5] hover:bg-[#D1FAE5] border border-[#A7F3D0] px-3 py-1.5 rounded-[8px] inline-flex items-center gap-1.5 cursor-pointer ui-interactive"
                          >
                            <Ticket className="h-4 w-4" />
                            <span>Pass #{item.booking_number}</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        ) : isZeroSuppliers ? (
                          <span className="text-xs sm:text-sm text-[#BE123C] font-medium">
                            0 partner fleets available at {item.flight?.to ?? "arrival airport"}
                          </span>
                        ) : (
                          <span className="text-xs sm:text-sm text-[#475569]">
                            <span className="font-semibold text-[#0F172A]">
                              {item.servability.servable_count}
                            </span>{" "}
                            matching fleet{item.servability.servable_count === 1 ? "" : "s"} ·{" "}
                            <span className="font-mono font-semibold text-[#4F46E5]">
                              {item.open_offers_count}
                            </span>{" "}
                            active quote{item.open_offers_count === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleToggleRequestDetail(item.request_id)}
                        className="ui-btn-secondary ui-focus px-4 text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer"
                      >
                        <span>
                          Vehicle Quotes ({item.total_offers_count})
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-[#4F46E5]" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-[#4F46E5]" />
                        )}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        key={`drawer-${item.request_id}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden border-t border-[#E5E9F2] bg-[#F8FAFC]"
                      >
                        <div className="p-5 sm:p-6 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-bold text-[#0F172A]">
                                Assigned Vehicles (
                                {expandedDetail ? expandedDetail.offers.length : item.total_offers_count}
                                )
                              </h3>
                              <p className="text-xs text-[#64748B] mt-0.5">
                                Compare verified operators, filter by vehicle class, and book your preferred ride.
                              </p>
                            </div>

                            {(item.total_offers_count > 0 ||
                              offerCarTypeFilter !== "ALL" ||
                              offerSort !== "") && (
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="relative h-9 rounded-[8px] bg-white border border-[#CBD5E1]">
                                  <select
                                    aria-label="Sort offers by price"
                                    value={offerSort}
                                    onChange={(e) => handleOfferSortChange(e.target.value)}
                                    className="h-full appearance-none bg-transparent pl-3 pr-8 text-xs font-medium text-[#0F172A] focus:outline-none cursor-pointer"
                                  >
                                    <option value="" className="bg-white text-[#0F172A]">
                                      Sort: Newest first
                                    </option>
                                    <option value="price_asc" className="bg-white text-[#0F172A]">
                                      Price: Low to High
                                    </option>
                                    <option value="price_desc" className="bg-white text-[#0F172A]">
                                      Price: High to Low
                                    </option>
                                  </select>
                                  <ChevronDown className="h-3.5 w-3.5 text-[#4F46E5] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    void loadRequestDetail(
                                      item.request_id,
                                      offerSort,
                                      offerCarTypeFilter,
                                      false
                                    )
                                  }
                                  title="Refresh vehicle quotes"
                                  aria-label="Refresh vehicle quotes"
                                  className="ui-btn-ghost ui-focus h-9 w-9 inline-flex items-center justify-center cursor-pointer"
                                >
                                  <RefreshCw
                                    className={`h-3.5 w-3.5 ${
                                      isLoadingDetail ? "animate-spin text-[#4F46E5]" : "text-[#475569]"
                                    }`}
                                  />
                                </button>
                              </div>
                            )}
                          </div>

                          {(item.total_offers_count > 0 || offerCarTypeFilter !== "ALL") && (
                            <div className="inline-flex flex-wrap items-center p-1 rounded-[10px] bg-white border border-[#E2E8F0] gap-0.5">
                              {CAR_TYPE_FILTERS.map((ct) => {
                                const active = offerCarTypeFilter === ct.value;
                                return (
                                  <button
                                    key={ct.value}
                                    type="button"
                                    onClick={() => handleOfferCarTypeChange(ct.value)}
                                    className={`relative px-3 py-1 rounded-[7px] text-xs font-semibold cursor-pointer transition-colors ${
                                      active
                                        ? "text-white"
                                        : "text-[#64748B] hover:text-[#0F172A]"
                                    }`}
                                  >
                                    {active && (
                                      <motion.span
                                        layoutId={`car-pill-${item.request_id}`}
                                        transition={SPRING_PILL}
                                        className="absolute inset-0 rounded-[7px] bg-[#4F46E5] shadow-xs"
                                      />
                                    )}
                                    <span className="relative z-10">{ct.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <AnimatePresence mode="wait">
                            {offerActionError && (
                              <NudgeAlert
                                triggerKey={`offer-err-${offerErrorSeq}`}
                                className="ui-alert-error p-4 space-y-1"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#BE123C]">
                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                    <span>
                                      {offerActionError.rule
                                        ? `Booking blocked (${offerActionError.rule})`
                                        : "Action unavailable"}
                                    </span>
                                  </span>
                                  <span className="font-mono text-xs text-[#9F1239]">
                                    {offerActionError.code}
                                  </span>
                                </div>
                                <p className="text-sm text-[#9F1239] leading-relaxed">
                                  {offerActionError.message}
                                </p>
                              </NudgeAlert>
                            )}
                          </AnimatePresence>

                          {offerActionSuccess && (
                            <div className="ui-alert-success p-3.5 flex items-center gap-2.5 text-sm text-[#065F46]">
                              <CheckCircle2 className="h-4 w-4 text-[#059669] shrink-0" />
                              <span>{offerActionSuccess}</span>
                            </div>
                          )}

                          {isLoadingDetail ? (
                            <div className="space-y-2.5">
                              <div className="h-20 w-full skeleton-bar" />
                            </div>
                          ) : !expandedDetail || expandedDetail.offers.length === 0 ? (
                            offerCarTypeFilter !== "ALL" ? (
                              <div className="bg-white border border-[#E5E9F2] rounded-[12px] p-4 flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm text-[#475569]">
                                  No quotes match vehicle class{" "}
                                  <span className="font-mono font-semibold text-[#0F172A]">
                                    {offerCarTypeFilter}
                                  </span>
                                  .
                                </p>
                                <button
                                  type="button"
                                  onClick={() => handleOfferCarTypeChange("ALL")}
                                  className="ui-btn-secondary ui-focus px-3.5 text-xs cursor-pointer"
                                >
                                  Show All Vehicles
                                </button>
                              </div>
                            ) : (
                              <div className="bg-white border border-[#E5E9F2] rounded-[12px] p-5 flex flex-wrap items-center justify-between gap-4">
                                <div className="space-y-1">
                                  <p className="text-sm font-semibold text-[#0F172A]">
                                    Waiting for operator vehicle quotes
                                  </p>
                                  <p className="text-xs text-[#64748B]">
                                    {isZeroSuppliers
                                      ? "No partner fleet covers this airport or time window."
                                      : "Eligible taxi operators can assign one or more fitting cars with custom quotes."}
                                  </p>
                                </div>
                                {!isZeroSuppliers && onSwitchToSupplier && (
                                  <button
                                    type="button"
                                    onClick={() => onSwitchToSupplier(firstEligibleSupplierId)}
                                    className="px-3.5 py-2 rounded-[9px] bg-[#F0FDFA] hover:bg-[#CCFBF1] border border-[#99F6E4] text-xs font-semibold text-[#0F766E] inline-flex items-center gap-1.5 cursor-pointer ui-interactive"
                                  >
                                    <Building2 className="h-3.5 w-3.5" />
                                    <span>Assign a car in Operator Desk →</span>
                                  </button>
                                )}
                              </div>
                            )
                          ) : (
                            <div className="space-y-3">
                              {expandedDetail.offers.map((offer, oIdx) => {
                                const statusBadge = getOfferStatusBadge(offer.status);
                                const topBorderClass = getOfferTopBorderClass(offer.status);
                                const countdown =
                                  offer.status === "OPEN"
                                    ? formatExpiryCountdown(offer.expires_at, nowMs)
                                    : null;
                                const isOfferBusy = actionOfferId === offer.offer_id;
                                const canActOnOffer =
                                  item.status === "OPEN" && offer.status === "OPEN";

                                return (
                                  <motion.div
                                    key={offer.offer_id}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{
                                      duration: 0.18,
                                      delay: Math.min(oIdx * 0.03, 0.15)
                                    }}
                                  >
                                    <SpotlightCard
                                      spotlightColor={
                                        offer.status === "BOOKED"
                                          ? "rgba(16, 185, 129, 0.06)"
                                          : "rgba(13, 148, 136, 0.055)"
                                      }
                                      hoverLift={canActOnOffer}
                                      className={`ui-card-flush ${topBorderClass} p-4 sm:p-5 space-y-3.5`}
                                    >
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="space-y-1.5">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-base font-bold text-[#0F172A]">
                                              {offer.company_name}
                                            </span>
                                            {offer.company_rating !== null && (
                                              <span className="inline-flex items-center gap-1 font-mono text-xs text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] px-2 py-0.5 rounded-full">
                                                <Star className="h-3 w-3 text-[#F59E0B] fill-[#F59E0B]" />
                                                {offer.company_rating.toFixed(1)}
                                              </span>
                                            )}
                                            <span className="ui-badge ui-badge-teal font-mono">
                                              {offer.vehicle?.type ?? offer.vehicle_id} · {offer.vehicle_id}
                                            </span>
                                            <span className={statusBadge.className}>
                                              {statusBadge.label}
                                            </span>
                                            {countdown && (
                                              <span
                                                className={`ui-badge font-mono ${
                                                  countdown.expired
                                                    ? "ui-badge-neutral"
                                                    : "ui-badge-pending"
                                                }`}
                                              >
                                                <Clock className="h-3 w-3" />
                                                <span>{countdown.text}</span>
                                              </span>
                                            )}
                                            {offer.status === "OPEN" && !offer.car_currently_free && (
                                              <span className="ui-badge ui-badge-rejected">
                                                Vehicle booked elsewhere
                                              </span>
                                            )}
                                          </div>

                                          {offer.vehicle && (
                                            <p className="font-mono text-xs text-[#64748B]">
                                              Up to {offer.vehicle.seats} passengers ·{" "}
                                              {offer.vehicle.large_bags} large / {offer.vehicle.small_bags} small bags
                                            </p>
                                          )}
                                        </div>

                                        <div className="text-right">
                                          <span className="font-mono text-xl font-bold text-[#0F172A] block">
                                            {formatInr(offer.price_inr)}
                                          </span>
                                          <span
                                            className={`inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold mt-1 ${
                                              offer.price_delta_inr < 0
                                                ? "bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]"
                                                : offer.price_delta_inr === 0
                                                  ? "bg-[#EEF2FF] text-[#4338ca] border border-[#C7D2FE]"
                                                  : "bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]"
                                            }`}
                                          >
                                            {offer.price_delta_inr === 0
                                              ? "Matches your offer"
                                              : offer.price_delta_inr < 0
                                                ? `Save ${formatInr(Math.abs(offer.price_delta_inr))} below offer`
                                                : `+${formatInr(offer.price_delta_inr)} above offer`}
                                          </span>
                                        </div>
                                      </div>

                                      {canActOnOffer && (
                                        <div className="pt-3 border-t border-[#E5E9F2] flex flex-wrap items-center justify-end gap-2.5">
                                          <button
                                            type="button"
                                            disabled={actionOfferId !== null}
                                            onClick={() => void handleRejectOffer(offer.offer_id)}
                                            className="ui-btn-ghost ui-focus px-4 text-xs sm:text-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                          >
                                            {isOfferBusy ? "Updating..." : "Reject"}
                                          </button>
                                          <ClickSparkButton
                                            type="button"
                                            sparkColor="#C7D2FE"
                                            disabled={actionOfferId !== null}
                                            onClick={() => void handleBookOffer(offer.offer_id)}
                                            className="ui-btn-primary ui-focus px-5 text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                          >
                                            <span>{isOfferBusy ? "Confirming..." : "Book Taxi"}</span>
                                            <ArrowRight className="h-4 w-4" />
                                          </ClickSparkButton>
                                        </div>
                                      )}

                                      {offer.status === "BOOKED" && expandedDetail.booking && (
                                        <div className="pt-3 border-t border-[#E5E9F2] flex items-center justify-between gap-2 text-xs">
                                          <span className="text-[#047857] font-semibold inline-flex items-center gap-1.5">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            <span>
                                              Confirmed · Pass #{expandedDetail.booking.booking_number}
                                            </span>
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              onOpenBooking(expandedDetail.booking!.booking_number)
                                            }
                                            className="font-semibold text-[#4F46E5] hover:text-[#4338CA] hover:underline inline-flex items-center gap-1 cursor-pointer"
                                          >
                                            <span>Open Transfer Pass</span>
                                            <ArrowRight className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      )}
                                    </SpotlightCard>
                                  </motion.div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
