import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  IndianRupee,
  Luggage,
  MapPin,
  PlaneLanding,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
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

interface TravelerWorkspaceProps {
  bootstrap: BootstrapData | null;
  onOpenBooking: (bookingNumber: string) => void;
  onCatalogRefresh?: () => void;
}

interface BannerError {
  rule?: string;
  code: string;
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

function getOfferStatusBadge(status: OfferStatus): { label: string; className: string } {
  if (status === "BOOKED") {
    return { label: "Booked", className: "ui-badge ui-badge-booked" };
  }
  if (status === "OPEN") {
    return { label: "Pending", className: "ui-badge ui-badge-pending" };
  }
  if (status === "REJECTED") {
    return { label: "Rejected", className: "ui-badge ui-badge-rejected" };
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
    return { text: `Expires in ${remainingSec}s`, expired: false };
  }
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  return { text: `Expires in ${mins}m ${secs}s`, expired: false };
}

export function TravelerWorkspace({
  bootstrap,
  onOpenBooking,
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
  const [createdBanner, setCreatedBanner] = useState<string | null>(null);

  const [requests, setRequests] = useState<EnrichedRideRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState<boolean>(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<RequestDetailData | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);

  const [offerSort, setOfferSort] = useState<string>("");
  const [offerCarTypeFilter, setOfferCarTypeFilter] = useState<string>("ALL");
  const [actionOfferId, setActionOfferId] = useState<string | null>(null);
  const [offerActionError, setOfferActionError] = useState<BannerError | null>(null);
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
        setRequestsError("Unable to load ride requests from backend.");
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
            message: "Unable to calculate route quote."
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

  function handlePrefillMenonDemo(): void {
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
      setOfferActionSuccess(`Taxi offer ${offerId} marked as Rejected.`);
      await Promise.all([
        loadRequests(),
        loadRequestDetail(expandedRequestId, offerSort, offerCarTypeFilter, true)
      ]);
      if (onCatalogRefresh) {
        onCatalogRefresh();
      }
    }
    catch (err) {
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
          message: "Failed to reject taxi offer."
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
          message: "Failed to confirm taxi booking."
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
    setIsSubmitting(true);

    try {
      const parsedChildAges = childAges.map((raw) => (raw.trim() === "" ? NaN : Number(raw)));
      const parsedPrice = priceInr.trim() === "" ? NaN : Number(priceInr);

      const result = await createRideRequest({
        traveler_name: travelerName.trim() || "Traveler",
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

      const matchSummary =
        result.servability.servable_count > 0
          ? `Sent to ${result.servability.servable_count} matching taxi supplier(s).`
          : "Saved, but 0 suppliers can currently serve this request (see reason on card).";

      setCreatedBanner(
        `Request ${result.request.request_id} posted at ${formatInr(result.request.price_inr)}. ${matchSummary}`
      );

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
          message: "Failed to submit ride request to backend."
        });
      }
    }
    finally {
      setIsSubmitting(false);
    }
  }

  const priceRangeFillPercent = useMemo(() => {
    if (!quote) {
      return 60;
    }
    const val = Number(priceInr);
    if (!Number.isFinite(val) || priceInr.trim() === "") {
      return 50;
    }
    const span = quote.price_max_inr - quote.price_min_inr;
    if (span <= 0) {
      return 100;
    }
    const rawPct = ((val - quote.price_min_inr) / span) * 100;
    return Math.min(100, Math.max(8, Math.round(rawPct)));
  }, [quote, priceInr]);

  return (
    <section className="panel-enter space-y-8">
      <div className="ui-card ui-top-indigo flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 ui-icon-circle ui-icon-indigo border border-[#C7D2FE] mt-0.5">
            <PlaneLanding className="h-6 w-6 stroke-[1.8]" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#4F46E5] mb-1">
              Traveler Portal
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A]">
              Post a Ride Request &amp; Compare Offers
            </h1>
            <p className="text-base text-[#64748B] mt-1">
              Choose your arrival flight and hotel, enter your target price within the route range, and review assigned taxis.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handlePrefillMenonDemo}
          className="ui-btn-secondary ui-focus px-4 text-sm inline-flex items-center gap-2 cursor-pointer"
        >
          <Sparkles className="h-4 w-4 text-[#4F46E5]" />
          <span>Pre-fill Menon Family Demo</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5 ui-card ui-top-indigo">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4 mb-6">
            <h2 className="text-lg font-bold text-[#0F172A]">
              New Ride Request
            </h2>
            <span className="ui-badge ui-badge-accent font-mono">
              Rules R1 · R2 · R3
            </span>
          </div>

          {submitError && (
            <div className="mb-5 ui-alert-error p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#DC2626]">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {submitError.rule ? `Rule ${submitError.rule} Refused` : "Validation Refused"}
                </span>
                <span className="font-mono text-xs text-[#991B1B]">
                  {submitError.code}
                </span>
              </div>
              <p className="text-sm text-[#991B1B] leading-relaxed">
                {submitError.message}
              </p>
            </div>
          )}

          {createdBanner && (
            <div className="mb-5 ui-alert-success p-4 flex items-start gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-[#16A34A] shrink-0 mt-0.5" />
              <p className="text-sm text-[#166534] leading-relaxed">
                {createdBanner}
              </p>
            </div>
          )}

          <form onSubmit={(e) => void handleSubmitRequest(e)} noValidate className="space-y-5">
            <div>
              <label
                htmlFor="traveler-name"
                className="block text-sm font-medium text-[#0F172A] mb-1.5"
              >
                Traveler / Family Name
              </label>
              <input
                id="traveler-name"
                type="text"
                value={travelerName}
                onChange={(e) => setTravelerName(e.target.value)}
                placeholder="e.g. Menon Family"
                className="ui-input w-full px-3.5 text-base placeholder:text-[#64748B]"
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <label
                  htmlFor="flight-select"
                  className="text-sm font-medium text-[#0F172A]"
                >
                  Arrival Flight
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAirportFilter("ALL")}
                    className={`px-2.5 py-0.5 rounded-[6px] font-mono text-xs border cursor-pointer ui-interactive ${
                      airportFilter === "ALL"
                        ? "bg-[#4F46E5] text-white border-[#4F46E5] font-semibold"
                        : "bg-[#F8FAFC] text-[#64748B] border-[#CBD5E1] hover:bg-[#EEF2FF] hover:text-[#4F46E5] hover:border-[#C7D2FE]"
                    }`}
                  >
                    ALL
                  </button>
                  {airports.map((airport) => (
                    <button
                      key={airport.code}
                      type="button"
                      onClick={() => setAirportFilter(airport.code)}
                      className={`px-2.5 py-0.5 rounded-[6px] font-mono text-xs border cursor-pointer ui-interactive ${
                        airportFilter === airport.code
                          ? "bg-[#4F46E5] text-white border-[#4F46E5] font-semibold"
                          : "bg-[#F8FAFC] text-[#64748B] border-[#CBD5E1] hover:bg-[#EEF2FF] hover:text-[#4F46E5] hover:border-[#C7D2FE]"
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
                    Select arrival flight ({filteredFlights.length})...
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
                className="block text-sm font-medium text-[#0F172A] mb-1.5"
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
                    Select hotel ({allHotels.length})...
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
                          {hotel.name} · {hotel.area} ({hotel.hotel_id})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 text-[#4F46E5] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {isQuoting && (
              <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] p-4 text-sm text-[#92400E]">
                Calculating route range &amp; earliest pickup...
              </div>
            )}

            {quoteError && !isQuoting && (
              <div className="ui-alert-error p-4 space-y-1">
                <span className="text-sm font-semibold text-[#DC2626] block">
                  {quoteError.rule ? `Rule ${quoteError.rule} Warning` : "Route Mismatch"}
                </span>
                <p className="text-sm text-[#991B1B] leading-relaxed">
                  {quoteError.message}
                </p>
              </div>
            )}

            {quote && !isQuoting && (
              <div className="ui-alert-info p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#92400E]">
                    <span className="h-6 w-6 ui-icon-circle ui-icon-amber">
                      <IndianRupee className="h-3.5 w-3.5" />
                    </span>
                    <span>Suggested Route Range (R3)</span>
                  </span>
                  <span className="font-mono text-base font-bold text-[#B45309]">
                    {formatInr(quote.price_min_inr)} – {formatInr(quote.price_max_inr)}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="h-2 w-full rounded-full bg-[#FDE68A] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#F59E0B] transition-all duration-150"
                      style={{ width: `${priceRangeFillPercent}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#FDE68A] text-xs">
                  <div>
                    <span className="text-[#92400E] block mb-0.5">Earliest Pickup (R2)</span>
                    <span className="font-mono font-semibold text-[#0F172A]">
                      {formatDateTimeLabel(quote.earliest_pickup)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#92400E] block mb-0.5">Route Distance</span>
                    <span className="font-mono font-semibold text-[#0F172A]">
                      {quote.drive_minutes}m · {quote.distance_km} km
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs font-medium text-[#92400E]">Quick price:</span>
                  <button
                    type="button"
                    onClick={() => setPriceInr(String(quote.price_min_inr))}
                    className="px-2.5 py-1 rounded-[6px] bg-white border border-[#FCD34D] hover:border-[#F59E0B] hover:bg-[#FEF3C7] font-mono text-xs font-medium text-[#92400E] cursor-pointer ui-interactive"
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
                    className="px-2.5 py-1 rounded-[6px] bg-white border border-[#FCD34D] hover:border-[#F59E0B] hover:bg-[#FEF3C7] font-mono text-xs font-medium text-[#92400E] cursor-pointer ui-interactive"
                  >
                    Mid {formatInr(Math.round((quote.price_min_inr + quote.price_max_inr) / 2))}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceInr(String(quote.price_max_inr))}
                    className="px-2.5 py-1 rounded-[6px] bg-white border border-[#FCD34D] hover:border-[#F59E0B] hover:bg-[#FEF3C7] font-mono text-xs font-medium text-[#92400E] cursor-pointer ui-interactive"
                  >
                    Max {formatInr(quote.price_max_inr)}
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="adults-input"
                  className="block text-sm font-medium text-[#0F172A] mb-1.5"
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
                  className="block text-sm font-medium text-[#0F172A] mb-1.5"
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
                  className="block text-sm font-medium text-[#0F172A] mb-1.5"
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
                <span className="text-sm font-medium text-[#0F172A]">
                  Children&apos;s Ages (0–17)
                </span>
                <button
                  type="button"
                  onClick={handleAddChild}
                  className="px-3 py-1.5 rounded-[6px] bg-[#EEF2FF] border border-[#C7D2FE] hover:bg-[#E0E7FF] text-xs font-semibold text-[#4338CA] inline-flex items-center gap-1 cursor-pointer ui-interactive"
                >
                  <Plus className="h-3.5 w-3.5 text-[#4F46E5]" />
                  <span>Add Child</span>
                </button>
              </div>

              {childAges.length === 0 ? (
                <p className="text-sm text-[#64748B]">
                  No children added. Click &ldquo;Add Child&rdquo; to include child ages.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {childAges.map((age, index) => (
                    <div
                      key={index}
                      className="inline-flex items-center bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] h-11 overflow-hidden focus-within:border-[#4F46E5] focus-within:bg-white"
                    >
                      <span className="px-2.5 text-xs font-semibold text-[#4338CA] bg-[#EEF2FF] h-full inline-flex items-center border-r border-[#C7D2FE]">
                        #{index + 1}
                      </span>
                      <input
                        type="number"
                        aria-label={`Child ${index + 1} age`}
                        value={age}
                        onChange={(e) => handleUpdateChildAge(index, e.target.value)}
                        className="w-16 h-full px-2.5 bg-transparent font-mono text-sm text-[#0F172A] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveChild(index)}
                        aria-label={`Remove child ${index + 1}`}
                        className="h-full px-2.5 text-[#64748B] hover:text-[#DC2626] hover:bg-[#FEF2F2] border-l border-[#E2E8F0] cursor-pointer ui-interactive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="pickup-input"
                  className="text-sm font-medium text-[#0F172A]"
                >
                  Pickup Time (Optional · Local Airport Time)
                </label>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  {quote && (
                    <button
                      type="button"
                      onClick={() => setPickup(quote.earliest_pickup)}
                      className="text-[#4F46E5] hover:text-[#4338CA] hover:underline cursor-pointer"
                    >
                      Use {quote.earliest_pickup.slice(11, 16)}
                    </button>
                  )}
                  {pickup && (
                    <button
                      type="button"
                      onClick={() => setPickup("")}
                      className="text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                    >
                      Clear
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
                Leave blank to default to landing + 60 minutes (R2).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="car-type-select"
                  className="block text-sm font-medium text-[#0F172A] mb-1.5"
                >
                  Car Type (Optional · G2)
                </label>
                <div className="relative ui-input-wrap">
                  <select
                    id="car-type-select"
                    value={carType}
                    onChange={(e) => setCarType(e.target.value)}
                    className="w-full h-full appearance-none bg-transparent pl-3.5 pr-8 text-sm text-[#0F172A] focus:outline-none cursor-pointer"
                  >
                    <option value="" className="bg-white text-[#0F172A]">
                      Any Car Type
                    </option>
                    <option value="HATCHBACK" className="bg-white text-[#0F172A]">
                      HATCHBACK
                    </option>
                    <option value="SEDAN" className="bg-white text-[#0F172A]">
                      SEDAN
                    </option>
                    <option value="SUV" className="bg-white text-[#0F172A]">
                      SUV
                    </option>
                    <option value="BUS" className="bg-white text-[#0F172A]">
                      BUS
                    </option>
                  </select>
                  <ChevronDown className="h-4 w-4 text-[#4F46E5] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label
                  htmlFor="price-input"
                  className="block text-sm font-medium text-[#0F172A] mb-1.5"
                >
                  Your Offer Price (INR · R3)
                </label>
                <div className="relative">
                  <IndianRupee className="h-4 w-4 text-[#D97706] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="price-input"
                    type="number"
                    value={priceInr}
                    onChange={(e) => setPriceInr(e.target.value)}
                    placeholder="e.g. 12000"
                    className="ui-input w-full pl-9 pr-3.5 font-mono text-base placeholder:font-sans placeholder:text-[#64748B]"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="ui-btn-primary ui-focus w-full mt-2 px-5 text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span>{isSubmitting ? "Posting Ride Request..." : "Post Ride Request"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 space-y-5">
          <div className="ui-card flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">
                Ride Requests ({requests.length})
              </h2>
              <p className="text-sm text-[#64748B] mt-0.5">
                Includes open requests, supplier eligibility diagnostics (M2), and assigned taxis.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadRequests()}
              className="ui-btn-secondary ui-focus px-4 text-sm inline-flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingRequests ? "animate-spin text-[#4F46E5]" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>

          {requestsError && (
            <div className="ui-alert-error p-4 text-sm text-[#991B1B]">
              {requestsError}
            </div>
          )}

          {isLoadingRequests && requests.length === 0 && (
            <div className="space-y-4">
              {[0, 1, 2].map((idx) => (
                <div key={idx} className="ui-card space-y-3">
                  <div className="h-5 w-40 skeleton-bar" />
                  <div className="h-4 w-64 skeleton-bar" />
                  <div className="h-10 w-full skeleton-bar" />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-4">
            {requests.map((item) => {
              const isExpanded = expandedRequestId === item.request_id;
              const isZeroSuppliers =
                item.status === "OPEN" && item.servability.servable_count === 0;

              return (
                <div
                  key={item.request_id}
                  className={`ui-card-flush ui-card-hover ${
                    item.status === "BOOKED" ? "ui-top-green" : "ui-top-indigo"
                  } ${isExpanded ? "ring-2 ring-[#4F46E5]/20 border-[#A5B4FC]" : ""}`}
                >
                  <div className="p-6 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-xs font-semibold text-[#4338CA] px-2.5 py-1 rounded-[6px] bg-[#EEF2FF] border border-[#C7D2FE]">
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
                          {item.status}
                        </span>
                        {item.car_type && (
                          <span className="ui-badge ui-badge-accent font-mono">
                            {item.car_type}
                          </span>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="font-mono text-lg font-bold text-[#0F172A] block">
                          {formatInr(item.price_inr)}
                        </span>
                        {item.route && (
                          <span className="font-mono text-xs text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] px-2 py-0.5 rounded-full inline-block mt-0.5">
                            Range {formatInr(item.route.price_min_inr)}–{formatInr(item.route.price_max_inr)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-[#64748B]">
                      <div className="flex items-center gap-2.5">
                        <span className="h-7 w-7 ui-icon-circle ui-icon-indigo">
                          <PlaneLanding className="h-3.5 w-3.5" />
                        </span>
                        <span className="truncate text-[#0F172A] font-medium">
                          {item.flight
                            ? `${item.flight.flight_id} (${item.flight.from} → ${item.flight.to})`
                            : item.flight_id}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="h-7 w-7 ui-icon-circle ui-icon-teal">
                          <MapPin className="h-3.5 w-3.5" />
                        </span>
                        <span className="truncate text-[#0F172A] font-medium">
                          {item.hotel
                            ? `${item.hotel.name} · ${item.hotel.city} (${item.hotel.area})`
                            : item.hotel_id}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="h-7 w-7 ui-icon-circle ui-icon-amber">
                          <Clock className="h-3.5 w-3.5" />
                        </span>
                        <span className="font-mono text-xs sm:text-sm text-[#0F172A]">
                          Pickup {formatDateTimeLabel(item.pickup)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="h-7 w-7 ui-icon-circle ui-icon-indigo">
                          <Users className="h-3.5 w-3.5" />
                        </span>
                        <span>
                          {item.adults} adult{item.adults === 1 ? "" : "s"}
                          {item.child_ages.length > 0
                            ? ` + ${item.child_ages.length} child (${item.child_ages.join(", ")}y)`
                            : ""}
                        </span>
                        <span className="text-[#CBD5E1]">·</span>
                        <Luggage className="h-4 w-4 text-[#64748B] shrink-0" />
                        <span>
                          {item.large_bags}L / {item.small_bags}S
                        </span>
                      </div>
                    </div>

                    {isZeroSuppliers && (
                      <div className="ui-alert-error p-4 space-y-1.5">
                        <div className="flex items-center gap-2 text-sm font-semibold text-[#DC2626]">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>No taxi supplier can serve this request (M2)</span>
                        </div>
                        <ul className="space-y-1 pl-5 list-disc text-sm text-[#991B1B]">
                          {item.servability.unservable_reasons.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 text-sm">
                      <div>
                        {item.status === "BOOKED" && item.booking_number ? (
                          <button
                            type="button"
                            onClick={() => onOpenBooking(item.booking_number!)}
                            className="font-mono font-semibold text-[#4F46E5] hover:text-[#4338CA] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>Booking #{item.booking_number}</span>
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        ) : isZeroSuppliers ? (
                          <span className="text-[#DC2626] font-medium">
                            0 eligible suppliers at {item.flight?.to ?? "arrival airport"}
                          </span>
                        ) : (
                          <span className="text-[#64748B]">
                            {item.servability.servable_count} eligible supplier
                            {item.servability.servable_count === 1 ? "" : "s"} ·{" "}
                            <span className="font-mono font-semibold text-[#4F46E5]">
                              {item.open_offers_count}
                            </span>{" "}
                            open taxi offer{item.open_offers_count === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleToggleRequestDetail(item.request_id)}
                        className="ui-btn-secondary ui-focus px-4 text-sm inline-flex items-center gap-2 cursor-pointer"
                      >
                        <span>
                          Assigned Taxis ({item.total_offers_count})
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-[#4F46E5]" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-[#4F46E5]" />
                        )}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-[#E2E8F0] bg-[#F4F6FB] p-6 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-[#0F172A]">
                            Assigned Taxis ({expandedDetail ? expandedDetail.offers.length : item.total_offers_count})
                          </h3>
                          <p className="text-xs text-[#64748B] mt-0.5">
                            Compare supplier fares, sort or filter offers (G5), and book or reject each car (M4 · R8).
                          </p>
                        </div>

                        {(item.total_offers_count > 0 ||
                          offerCarTypeFilter !== "ALL" ||
                          offerSort !== "") && (
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="relative ui-input-wrap bg-white">
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
                                  Price: Low to High (G5)
                                </option>
                                <option value="price_desc" className="bg-white text-[#0F172A]">
                                  Price: High to Low (G5)
                                </option>
                              </select>
                              <ChevronDown className="h-3.5 w-3.5 text-[#4F46E5] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>

                            <div className="relative ui-input-wrap bg-white">
                              <select
                                aria-label="Filter offers by car type"
                                value={offerCarTypeFilter}
                                onChange={(e) => handleOfferCarTypeChange(e.target.value)}
                                className="h-full appearance-none bg-transparent pl-3 pr-8 text-xs font-medium text-[#0F172A] focus:outline-none cursor-pointer"
                              >
                                <option value="ALL" className="bg-white text-[#0F172A]">
                                  Car Type: All
                                </option>
                                <option value="HATCHBACK" className="bg-white text-[#0F172A]">
                                  HATCHBACK
                                </option>
                                <option value="SEDAN" className="bg-white text-[#0F172A]">
                                  SEDAN
                                </option>
                                <option value="SUV" className="bg-white text-[#0F172A]">
                                  SUV
                                </option>
                                <option value="BUS" className="bg-white text-[#0F172A]">
                                  BUS
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
                              title="Refresh offers"
                              aria-label="Refresh offers"
                              className="ui-btn-secondary ui-focus w-11 inline-flex items-center justify-center cursor-pointer"
                            >
                              <RefreshCw
                                className={`h-4 w-4 ${
                                  isLoadingDetail ? "animate-spin text-[#4F46E5]" : ""
                                }`}
                              />
                            </button>
                          </div>
                        )}
                      </div>

                      {offerActionError && (
                        <div className="ui-alert-error p-4 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#DC2626]">
                              <AlertTriangle className="h-4 w-4 shrink-0" />
                              {offerActionError.rule
                                ? `Rule ${offerActionError.rule} Refused`
                                : "Action Refused"}
                            </span>
                            <span className="font-mono text-xs text-[#991B1B]">
                              {offerActionError.code}
                            </span>
                          </div>
                          <p className="text-sm text-[#991B1B] leading-relaxed">
                            {offerActionError.message}
                          </p>
                        </div>
                      )}

                      {offerActionSuccess && (
                        <div className="ui-alert-success p-4 flex items-center gap-2.5 text-sm text-[#166534]">
                          <CheckCircle2 className="h-4 w-4 text-[#16A34A] shrink-0" />
                          <span>{offerActionSuccess}</span>
                        </div>
                      )}

                      {isLoadingDetail ? (
                        <p className="text-sm text-[#64748B]">Loading assigned taxis...</p>
                      ) : !expandedDetail || expandedDetail.offers.length === 0 ? (
                        offerCarTypeFilter !== "ALL" ? (
                          <div className="ui-card flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm text-[#64748B]">
                              No assigned taxis match car type{" "}
                              <span className="font-mono font-semibold text-[#0F172A]">
                                {offerCarTypeFilter}
                              </span>
                              .
                            </p>
                            <button
                              type="button"
                              onClick={() => handleOfferCarTypeChange("ALL")}
                              className="ui-btn-secondary ui-focus px-4 text-sm cursor-pointer"
                            >
                              Show All Car Types
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm text-[#64748B]">
                            No taxi offers assigned yet. Switch to a Taxi Supplier workspace to assign a car and price.
                          </p>
                        )
                      ) : (
                        <div className="space-y-3.5">
                          {expandedDetail.offers.map((offer) => {
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
                              <div
                                key={offer.offer_id}
                                className={`ui-card-flush ${topBorderClass} p-4 space-y-3`}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-base font-bold text-[#0F172A]">
                                        {offer.company_name}
                                      </span>
                                      {offer.company_rating !== null && (
                                        <span className="inline-flex items-center gap-1 font-mono text-xs text-[#B45309] bg-[#FEF3C7] px-2 py-0.5 rounded-full">
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
                                          {countdown.text}
                                        </span>
                                      )}
                                      {offer.status === "OPEN" && !offer.car_currently_free && (
                                        <span className="ui-badge ui-badge-pending">
                                          Car busy on another ride (R6)
                                        </span>
                                      )}
                                    </div>

                                    {offer.vehicle && (
                                      <p className="font-mono text-xs text-[#64748B]">
                                        {offer.vehicle.seats} seats · {offer.vehicle.large_bags}L /{" "}
                                        {offer.vehicle.small_bags}S bags · {offer.offer_id}
                                      </p>
                                    )}
                                  </div>

                                  <div className="text-right">
                                    <span className="font-mono text-lg font-bold text-[#0F172A] block">
                                      {formatInr(offer.price_inr)}
                                    </span>
                                    <span
                                      className={`font-mono text-xs font-medium block ${
                                        offer.price_delta_inr <= 0
                                          ? "text-[#15803D]"
                                          : "text-[#B45309]"
                                      }`}
                                    >
                                      {offer.price_delta_inr === 0
                                        ? "Matches your ask"
                                        : offer.price_delta_inr < 0
                                          ? `${formatInr(Math.abs(offer.price_delta_inr))} below your ask`
                                          : `+${formatInr(offer.price_delta_inr)} vs your ask`}
                                    </span>
                                  </div>
                                </div>

                                {canActOnOffer && (
                                  <div className="pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center justify-end gap-2.5">
                                    <button
                                      type="button"
                                      disabled={actionOfferId !== null}
                                      onClick={() => void handleRejectOffer(offer.offer_id)}
                                      className="ui-btn-secondary ui-focus px-4 text-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                      {isOfferBusy ? "Working..." : "Reject"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={actionOfferId !== null}
                                      onClick={() => void handleBookOffer(offer.offer_id)}
                                      className="ui-btn-primary ui-focus px-5 text-sm inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                      <span>{isOfferBusy ? "Booking..." : "Book Taxi"}</span>
                                      <ArrowRight className="h-4 w-4" />
                                    </button>
                                  </div>
                                )}

                                {offer.status === "BOOKED" && expandedDetail.booking && (
                                  <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between gap-2 text-xs">
                                    <span className="text-[#15803D] font-semibold">
                                      Confirmed booking #{expandedDetail.booking.booking_number}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onOpenBooking(expandedDetail.booking!.booking_number)
                                      }
                                      className="font-semibold text-[#4F46E5] hover:text-[#4338CA] hover:underline inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <span>View Booking Summary</span>
                                      <ArrowRight className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
