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
  createRideRequest,
  fetchRequestDetail,
  fetchRideRequests,
  fetchRouteQuote
} from "../api/client";
import type {
  BootstrapData,
  EnrichedRideRequest,
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

  async function handleToggleRequestDetail(requestId: string): Promise<void> {
    if (expandedRequestId === requestId) {
      setExpandedRequestId(null);
      setExpandedDetail(null);
      return;
    }

    setExpandedRequestId(requestId);
    setExpandedDetail(null);
    setIsLoadingDetail(true);

    try {
      const detail = await fetchRequestDetail(requestId);
      setExpandedDetail(detail);
    }
    catch {
      setExpandedDetail(null);
    }
    finally {
      setIsLoadingDetail(false);
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

  return (
    <section className="panel-enter space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#27272A] pb-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#A3E635] mb-1.5">
            Traveler Portal
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-[#FAFAFA]">
            Post a Ride Request &amp; Compare Offers
          </h1>
          <p className="text-sm text-[#A1A1AA] mt-1">
            Choose your arrival flight and hotel, enter your target price within the route range, and review assigned taxis.
          </p>
        </div>

        <button
          type="button"
          onClick={handlePrefillMenonDemo}
          className="ui-interactive ui-focus h-9 px-3.5 bg-[#18181B] border border-[#27272A] hover:border-[#A3E635] hover:bg-[#202024] text-xs font-medium text-[#FAFAFA] inline-flex items-center gap-2 cursor-pointer"
        >
          <Sparkles className="h-3.5 w-3.5 text-[#A3E635]" />
          <span>Pre-fill Menon Family Demo</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
        <div className="lg:col-span-5 bg-[#18181B] border border-[#27272A] p-6">
          <div className="flex items-center justify-between border-b border-[#27272A] pb-4 mb-5">
            <h2 className="text-base font-semibold text-[#FAFAFA]">
              New Ride Request
            </h2>
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#71717A]">
              Rules R1 · R2 · R3
            </span>
          </div>

          {submitError && (
            <div className="mb-5 bg-[#111113] border border-[#27272A] border-l-2 border-l-[#F87171] p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[#F87171]">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {submitError.rule ? `Rule ${submitError.rule} Refused` : "Validation Refused"}
                </span>
                <span className="font-mono text-[11px] text-[#71717A]">
                  {submitError.code}
                </span>
              </div>
              <p className="text-xs text-[#FAFAFA] leading-relaxed">
                {submitError.message}
              </p>
            </div>
          )}

          {createdBanner && (
            <div className="mb-5 bg-[#111113] border border-[#27272A] border-l-2 border-l-[#A3E635] p-4 flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-[#A3E635] shrink-0 mt-0.5" />
              <p className="text-xs text-[#FAFAFA] leading-relaxed">
                {createdBanner}
              </p>
            </div>
          )}

          <form onSubmit={(e) => void handleSubmitRequest(e)} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="traveler-name"
                className="block text-xs font-medium text-[#A1A1AA] mb-1.5"
              >
                Traveler / Family Name
              </label>
              <input
                id="traveler-name"
                type="text"
                value={travelerName}
                onChange={(e) => setTravelerName(e.target.value)}
                placeholder="e.g. Menon Family"
                className="ui-interactive ui-focus w-full h-10 px-3 bg-[#111113] border border-[#27272A] focus:border-[#A3E635] text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:outline-none"
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="flight-select"
                  className="text-xs font-medium text-[#A1A1AA]"
                >
                  Arrival Flight
                </label>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setAirportFilter("ALL")}
                    className={`px-2 py-0.5 font-mono text-[11px] border cursor-pointer ui-interactive ${
                      airportFilter === "ALL"
                        ? "bg-[#A3E635] text-[#09090B] border-[#A3E635] font-semibold"
                        : "bg-[#111113] text-[#A1A1AA] border-[#27272A] hover:border-[#3F3F46]"
                    }`}
                  >
                    ALL
                  </button>
                  {airports.map((airport) => (
                    <button
                      key={airport.code}
                      type="button"
                      onClick={() => setAirportFilter(airport.code)}
                      className={`px-2 py-0.5 font-mono text-[11px] border cursor-pointer ui-interactive ${
                        airportFilter === airport.code
                          ? "bg-[#A3E635] text-[#09090B] border-[#A3E635] font-semibold"
                          : "bg-[#111113] text-[#A1A1AA] border-[#27272A] hover:border-[#3F3F46]"
                      }`}
                    >
                      {airport.code}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative h-10 bg-[#111113] border border-[#27272A] focus-within:border-[#A3E635] ui-interactive">
                <select
                  id="flight-select"
                  value={flightId}
                  onChange={(e) => setFlightId(e.target.value)}
                  className="ui-focus w-full h-full appearance-none bg-transparent pl-3 pr-9 text-xs sm:text-sm text-[#FAFAFA] focus:outline-none cursor-pointer"
                >
                  <option value="" className="bg-[#18181B] text-[#71717A]">
                    Select arrival flight ({filteredFlights.length})...
                  </option>
                  {filteredFlights.map((flight) => (
                    <option
                      key={flight.flight_id}
                      value={flight.flight_id}
                      className="bg-[#18181B] text-[#FAFAFA]"
                    >
                      {flight.flight_id} · {flight.from} → {flight.to} · Lands {formatDateTimeLabel(flight.arrival_local)} ({flight.airline})
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 text-[#71717A] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label
                htmlFor="hotel-select"
                className="block text-xs font-medium text-[#A1A1AA] mb-1.5"
              >
                Destination Hotel
              </label>
              <div className="relative h-10 bg-[#111113] border border-[#27272A] focus-within:border-[#A3E635] ui-interactive">
                <select
                  id="hotel-select"
                  value={hotelId}
                  onChange={(e) => setHotelId(e.target.value)}
                  className="ui-focus w-full h-full appearance-none bg-transparent pl-3 pr-9 text-xs sm:text-sm text-[#FAFAFA] focus:outline-none cursor-pointer"
                >
                  <option value="" className="bg-[#18181B] text-[#71717A]">
                    Select hotel ({allHotels.length})...
                  </option>
                  {hotelsByCity.map(([city, cityHotels]) => (
                    <optgroup
                      key={city}
                      label={`${city} (${cityHotels.length})`}
                      className="bg-[#18181B] text-[#A1A1AA]"
                    >
                      {cityHotels.map((hotel) => (
                        <option
                          key={hotel.hotel_id}
                          value={hotel.hotel_id}
                          className="bg-[#18181B] text-[#FAFAFA]"
                        >
                          {hotel.name} · {hotel.area} ({hotel.hotel_id})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 text-[#71717A] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {isQuoting && (
              <div className="bg-[#111113] border border-[#27272A] p-3.5 text-xs text-[#A1A1AA]">
                Calculating route range &amp; earliest pickup...
              </div>
            )}

            {quoteError && !isQuoting && (
              <div className="bg-[#111113] border border-[#27272A] border-l-2 border-l-[#FBBF24] p-3.5 space-y-1">
                <span className="font-mono text-xs font-semibold text-[#FBBF24] block">
                  {quoteError.rule ? `Rule ${quoteError.rule} Warning` : "Route Mismatch"}
                </span>
                <p className="text-xs text-[#A1A1AA] leading-relaxed">
                  {quoteError.message}
                </p>
              </div>
            )}

            {quote && !isQuoting && (
              <div className="bg-[#111113] border border-[#27272A] border-l-2 border-l-[#A3E635] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[#A1A1AA]">
                    Suggested Route Range (R3)
                  </span>
                  <span className="font-mono text-sm font-semibold text-[#A3E635]">
                    {formatInr(quote.price_min_inr)} – {formatInr(quote.price_max_inr)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#27272A] text-xs">
                  <div>
                    <span className="text-[#71717A] block">Earliest Pickup (R2)</span>
                    <span className="font-mono text-[#FAFAFA]">
                      {formatDateTimeLabel(quote.earliest_pickup)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#71717A] block">Route Distance</span>
                    <span className="font-mono text-[#FAFAFA]">
                      {quote.drive_minutes}m · {quote.distance_km} km
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-[#71717A] mr-1">Quick price:</span>
                  <button
                    type="button"
                    onClick={() => setPriceInr(String(quote.price_min_inr))}
                    className="px-2 py-0.5 bg-[#18181B] border border-[#27272A] hover:border-[#A3E635] font-mono text-[11px] text-[#FAFAFA] cursor-pointer ui-interactive"
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
                    className="px-2 py-0.5 bg-[#18181B] border border-[#27272A] hover:border-[#A3E635] font-mono text-[11px] text-[#FAFAFA] cursor-pointer ui-interactive"
                  >
                    Mid {formatInr(Math.round((quote.price_min_inr + quote.price_max_inr) / 2))}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceInr(String(quote.price_max_inr))}
                    className="px-2 py-0.5 bg-[#18181B] border border-[#27272A] hover:border-[#A3E635] font-mono text-[11px] text-[#FAFAFA] cursor-pointer ui-interactive"
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
                  className="block text-xs font-medium text-[#A1A1AA] mb-1.5"
                >
                  Adults
                </label>
                <input
                  id="adults-input"
                  type="number"
                  value={adults}
                  onChange={(e) => setAdults(e.target.value)}
                  className="ui-interactive ui-focus w-full h-10 px-3 bg-[#111113] border border-[#27272A] focus:border-[#A3E635] font-mono text-sm text-[#FAFAFA] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="large-bags-input"
                  className="block text-xs font-medium text-[#A1A1AA] mb-1.5"
                >
                  Large Bags
                </label>
                <input
                  id="large-bags-input"
                  type="number"
                  value={largeBags}
                  onChange={(e) => setLargeBags(e.target.value)}
                  className="ui-interactive ui-focus w-full h-10 px-3 bg-[#111113] border border-[#27272A] focus:border-[#A3E635] font-mono text-sm text-[#FAFAFA] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="small-bags-input"
                  className="block text-xs font-medium text-[#A1A1AA] mb-1.5"
                >
                  Small Bags
                </label>
                <input
                  id="small-bags-input"
                  type="number"
                  value={smallBags}
                  onChange={(e) => setSmallBags(e.target.value)}
                  className="ui-interactive ui-focus w-full h-10 px-3 bg-[#111113] border border-[#27272A] focus:border-[#A3E635] font-mono text-sm text-[#FAFAFA] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-[#A1A1AA]">
                  Children&apos;s Ages (0–17)
                </span>
                <button
                  type="button"
                  onClick={handleAddChild}
                  className="ui-interactive ui-focus px-2.5 py-1 bg-[#111113] border border-[#27272A] hover:border-[#A3E635] text-xs text-[#FAFAFA] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3 w-3 text-[#A3E635]" />
                  <span>Add Child</span>
                </button>
              </div>

              {childAges.length === 0 ? (
                <p className="text-xs text-[#71717A]">
                  No children added. Click &ldquo;Add Child&rdquo; to include child ages.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {childAges.map((age, index) => (
                    <div
                      key={index}
                      className="inline-flex items-center bg-[#111113] border border-[#27272A] h-9"
                    >
                      <span className="px-2 text-[11px] text-[#71717A] border-r border-[#27272A]">
                        #{index + 1}
                      </span>
                      <input
                        type="number"
                        aria-label={`Child ${index + 1} age`}
                        value={age}
                        onChange={(e) => handleUpdateChildAge(index, e.target.value)}
                        className="w-14 h-full px-2 bg-transparent font-mono text-xs text-[#FAFAFA] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveChild(index)}
                        aria-label={`Remove child ${index + 1}`}
                        className="h-full px-2 text-[#71717A] hover:text-[#F87171] border-l border-[#27272A] cursor-pointer"
                      >
                        <X className="h-3 w-3" />
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
                  className="text-xs font-medium text-[#A1A1AA]"
                >
                  Pickup Time (Optional · Local Airport Time)
                </label>
                <div className="flex items-center gap-2 text-[11px]">
                  {quote && (
                    <button
                      type="button"
                      onClick={() => setPickup(quote.earliest_pickup)}
                      className="text-[#A3E635] hover:underline cursor-pointer"
                    >
                      Use {quote.earliest_pickup.slice(11, 16)}
                    </button>
                  )}
                  {pickup && (
                    <button
                      type="button"
                      onClick={() => setPickup("")}
                      className="text-[#71717A] hover:text-[#FAFAFA] cursor-pointer"
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
                className="ui-interactive ui-focus w-full h-10 px-3 bg-[#111113] border border-[#27272A] focus:border-[#A3E635] font-mono text-xs sm:text-sm text-[#FAFAFA] focus:outline-none"
              />
              <p className="text-[11px] text-[#71717A] mt-1">
                Leave blank to default to landing + 60 minutes (R2).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="car-type-select"
                  className="block text-xs font-medium text-[#A1A1AA] mb-1.5"
                >
                  Car Type (Optional · G2)
                </label>
                <div className="relative h-10 bg-[#111113] border border-[#27272A] focus-within:border-[#A3E635] ui-interactive">
                  <select
                    id="car-type-select"
                    value={carType}
                    onChange={(e) => setCarType(e.target.value)}
                    className="ui-focus w-full h-full appearance-none bg-transparent pl-3 pr-8 text-xs sm:text-sm text-[#FAFAFA] focus:outline-none cursor-pointer"
                  >
                    <option value="" className="bg-[#18181B] text-[#FAFAFA]">
                      Any Car Type
                    </option>
                    <option value="HATCHBACK" className="bg-[#18181B] text-[#FAFAFA]">
                      HATCHBACK
                    </option>
                    <option value="SEDAN" className="bg-[#18181B] text-[#FAFAFA]">
                      SEDAN
                    </option>
                    <option value="SUV" className="bg-[#18181B] text-[#FAFAFA]">
                      SUV
                    </option>
                    <option value="BUS" className="bg-[#18181B] text-[#FAFAFA]">
                      BUS
                    </option>
                  </select>
                  <ChevronDown className="h-4 w-4 text-[#71717A] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label
                  htmlFor="price-input"
                  className="block text-xs font-medium text-[#A1A1AA] mb-1.5"
                >
                  Your Offer Price (INR · R3)
                </label>
                <div className="relative h-10">
                  <IndianRupee className="h-3.5 w-3.5 text-[#71717A] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="price-input"
                    type="number"
                    value={priceInr}
                    onChange={(e) => setPriceInr(e.target.value)}
                    placeholder="e.g. 12000"
                    className="ui-interactive ui-focus w-full h-full pl-8 pr-3 bg-[#111113] border border-[#27272A] focus:border-[#A3E635] font-mono text-sm text-[#FAFAFA] placeholder:font-sans placeholder:text-[#71717A] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="ui-interactive ui-focus w-full h-11 mt-2 bg-[#A3E635] hover:bg-[#BEF264] disabled:opacity-60 text-[#09090B] font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <span>{isSubmitting ? "Posting Ride Request..." : "Post Ride Request"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between bg-[#18181B] border border-[#27272A] px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-[#FAFAFA]">
                Ride Requests ({requests.length})
              </h2>
              <p className="text-xs text-[#71717A]">
                Includes open requests, supplier eligibility diagnostics (M2), and assigned taxis.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadRequests()}
              className="ui-interactive ui-focus h-8 px-3 bg-[#111113] border border-[#27272A] hover:border-[#3F3F46] text-xs text-[#A1A1AA] hover:text-[#FAFAFA] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`h-3 w-3 ${isLoadingRequests ? "animate-spin text-[#A3E635]" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>

          {requestsError && (
            <div className="bg-[#18181B] border border-[#27272A] border-l-2 border-l-[#F87171] p-4 text-xs text-[#FAFAFA]">
              {requestsError}
            </div>
          )}

          {isLoadingRequests && requests.length === 0 && (
            <div className="space-y-3">
              {[0, 1, 2].map((idx) => (
                <div key={idx} className="bg-[#18181B] border border-[#27272A] p-5 space-y-3">
                  <div className="h-4 w-40 skeleton-bar" />
                  <div className="h-3 w-64 skeleton-bar" />
                  <div className="h-8 w-full skeleton-bar" />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3.5">
            {requests.map((item) => {
              const isExpanded = expandedRequestId === item.request_id;
              const isZeroSuppliers =
                item.status === "OPEN" && item.servability.servable_count === 0;

              return (
                <div
                  key={item.request_id}
                  className={`bg-[#18181B] border ui-interactive ${
                    isExpanded ? "border-[#A3E635]" : "border-[#27272A] hover:border-[#3F3F46]"
                  }`}
                >
                  <div className="p-5 space-y-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-[#FAFAFA] px-2 py-0.5 bg-[#111113] border border-[#27272A]">
                          {item.request_id}
                        </span>
                        <span className="text-sm font-semibold text-[#FAFAFA]">
                          {item.traveler_name}
                        </span>
                        <span
                          className={`px-2 py-0.5 font-mono text-[11px] border ${
                            item.status === "BOOKED"
                              ? "bg-[#A3E635]/15 text-[#A3E635] border-[#A3E635]/40"
                              : "bg-[#111113] text-[#A1A1AA] border-[#27272A]"
                          }`}
                        >
                          {item.status}
                        </span>
                        {item.car_type && (
                          <span className="px-2 py-0.5 font-mono text-[11px] bg-[#111113] border border-[#27272A] text-[#A3E635]">
                            {item.car_type}
                          </span>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="font-mono text-base font-semibold text-[#FAFAFA] block">
                          {formatInr(item.price_inr)}
                        </span>
                        {item.route && (
                          <span className="font-mono text-[11px] text-[#71717A] block">
                            Range {formatInr(item.route.price_min_inr)}–{formatInr(item.route.price_max_inr)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#A1A1AA]">
                      <div className="flex items-center gap-2">
                        <PlaneLanding className="h-3.5 w-3.5 text-[#A3E635] shrink-0" />
                        <span className="truncate">
                          {item.flight
                            ? `${item.flight.flight_id} (${item.flight.from} → ${item.flight.to})`
                            : item.flight_id}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-[#A3E635] shrink-0" />
                        <span className="truncate">
                          {item.hotel
                            ? `${item.hotel.name} · ${item.hotel.city} (${item.hotel.area})`
                            : item.hotel_id}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-[#71717A] shrink-0" />
                        <span className="font-mono">
                          Pickup {formatDateTimeLabel(item.pickup)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-[#71717A] shrink-0" />
                        <span>
                          {item.adults} adult{item.adults === 1 ? "" : "s"}
                          {item.child_ages.length > 0
                            ? ` + ${item.child_ages.length} child (${item.child_ages.join(", ")}y)`
                            : ""}
                        </span>
                        <span className="text-[#71717A]">·</span>
                        <Luggage className="h-3.5 w-3.5 text-[#71717A] shrink-0" />
                        <span>
                          {item.large_bags}L / {item.small_bags}S
                        </span>
                      </div>
                    </div>

                    {isZeroSuppliers && (
                      <div className="bg-[#111113] border border-[#27272A] border-l-2 border-l-[#FBBF24] p-3.5 space-y-1.5">
                        <div className="flex items-center gap-2 text-xs font-semibold text-[#FBBF24]">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          <span>No taxi supplier can serve this request (M2)</span>
                        </div>
                        <ul className="space-y-1 pl-5 list-disc text-xs text-[#A1A1AA]">
                          {item.servability.unservable_reasons.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="pt-3 border-t border-[#27272A] flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div>
                        {item.status === "BOOKED" && item.booking_number ? (
                          <button
                            type="button"
                            onClick={() => onOpenBooking(item.booking_number!)}
                            className="font-mono text-[#A3E635] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>Booking #{item.booking_number}</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        ) : isZeroSuppliers ? (
                          <span className="text-[#FBBF24]">
                            0 eligible suppliers at {item.flight?.to ?? "arrival airport"}
                          </span>
                        ) : (
                          <span className="text-[#A1A1AA]">
                            {item.servability.servable_count} eligible supplier
                            {item.servability.servable_count === 1 ? "" : "s"} ·{" "}
                            <span className="font-mono text-[#FAFAFA]">
                              {item.open_offers_count}
                            </span>{" "}
                            open taxi offer{item.open_offers_count === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleToggleRequestDetail(item.request_id)}
                        className="ui-interactive ui-focus px-3 py-1.5 bg-[#111113] border border-[#27272A] hover:border-[#A3E635] text-xs font-medium text-[#FAFAFA] inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>
                          Assigned Taxis ({item.total_offers_count})
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5 text-[#A3E635]" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-[#71717A]" />
                        )}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-[#27272A] bg-[#111113] p-5">
                      {isLoadingDetail ? (
                        <p className="text-xs text-[#A1A1AA]">Loading assigned taxis...</p>
                      ) : !expandedDetail || expandedDetail.offers.length === 0 ? (
                        <p className="text-xs text-[#71717A]">
                          No taxi offers assigned yet. Switch to a Taxi Supplier workspace to assign a car and price.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          <p className="text-xs text-[#A1A1AA] mb-2">
                            Assigned Taxis ({expandedDetail.offers.length}) — Book &amp; Reject actions wire in Step 9:
                          </p>
                          {expandedDetail.offers.map((offer) => (
                            <div
                              key={offer.offer_id}
                              className="bg-[#18181B] border border-[#27272A] p-3.5 flex flex-wrap items-center justify-between gap-3"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-[#FAFAFA]">
                                    {offer.company_name}
                                  </span>
                                  {offer.company_rating !== null && (
                                    <span className="inline-flex items-center gap-1 font-mono text-xs text-[#A1A1AA]">
                                      <Star className="h-3 w-3 text-[#A3E635] fill-[#A3E635]" />
                                      {offer.company_rating.toFixed(1)}
                                    </span>
                                  )}
                                  <span className="px-2 py-0.5 bg-[#111113] border border-[#27272A] font-mono text-[11px] text-[#A3E635]">
                                    {offer.vehicle?.type ?? offer.vehicle_id} · {offer.vehicle_id}
                                  </span>
                                </div>
                                {offer.vehicle && (
                                  <p className="font-mono text-[11px] text-[#71717A]">
                                    {offer.vehicle.seats} seats · {offer.vehicle.large_bags}L / {offer.vehicle.small_bags}S bags · Status: {offer.status}
                                  </p>
                                )}
                              </div>

                              <div className="text-right">
                                <span className="font-mono text-sm font-semibold text-[#FAFAFA] block">
                                  {formatInr(offer.price_inr)}
                                </span>
                                <span
                                  className={`font-mono text-[11px] block ${
                                    offer.price_delta_inr <= 0
                                      ? "text-[#A3E635]"
                                      : "text-[#A1A1AA]"
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
                          ))}
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
