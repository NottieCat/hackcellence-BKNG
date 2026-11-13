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
    <section className="panel-enter space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E5E7EB] pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#2563EB] mb-1.5">
            Traveler Portal
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#111827]">
            Post a Ride Request &amp; Compare Offers
          </h1>
          <p className="text-base text-[#6B7280] mt-1.5">
            Choose your arrival flight and hotel, enter your target price within the route range, and review assigned taxis.
          </p>
        </div>

        <button
          type="button"
          onClick={handlePrefillMenonDemo}
          className="ui-btn-secondary ui-focus px-4 text-sm inline-flex items-center gap-2 cursor-pointer"
        >
          <Sparkles className="h-4 w-4 text-[#2563EB]" />
          <span>Pre-fill Menon Family Demo</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5 ui-card">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-4 mb-6">
            <h2 className="text-lg font-bold text-[#111827]">
              New Ride Request
            </h2>
            <span className="ui-badge ui-badge-neutral font-mono">
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
                className="block text-sm font-medium text-[#111827] mb-1.5"
              >
                Traveler / Family Name
              </label>
              <input
                id="traveler-name"
                type="text"
                value={travelerName}
                onChange={(e) => setTravelerName(e.target.value)}
                placeholder="e.g. Menon Family"
                className="ui-input w-full px-3.5 text-base placeholder:text-[#6B7280]"
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <label
                  htmlFor="flight-select"
                  className="text-sm font-medium text-[#111827]"
                >
                  Arrival Flight
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAirportFilter("ALL")}
                    className={`px-2.5 py-0.5 rounded-[6px] font-mono text-xs border cursor-pointer ui-interactive ${
                      airportFilter === "ALL"
                        ? "bg-[#2563EB] text-white border-[#2563EB] font-semibold"
                        : "bg-white text-[#6B7280] border-[#D1D5DB] hover:bg-[#F8F9FB] hover:text-[#111827]"
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
                          ? "bg-[#2563EB] text-white border-[#2563EB] font-semibold"
                          : "bg-white text-[#6B7280] border-[#D1D5DB] hover:bg-[#F8F9FB] hover:text-[#111827]"
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
                  className="w-full h-full appearance-none bg-transparent pl-3.5 pr-9 text-sm text-[#111827] focus:outline-none cursor-pointer"
                >
                  <option value="" className="bg-white text-[#6B7280]">
                    Select arrival flight ({filteredFlights.length})...
                  </option>
                  {filteredFlights.map((flight) => (
                    <option
                      key={flight.flight_id}
                      value={flight.flight_id}
                      className="bg-white text-[#111827]"
                    >
                      {flight.flight_id} · {flight.from} → {flight.to} · Lands {formatDateTimeLabel(flight.arrival_local)} ({flight.airline})
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 text-[#6B7280] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label
                htmlFor="hotel-select"
                className="block text-sm font-medium text-[#111827] mb-1.5"
              >
                Destination Hotel
              </label>
              <div className="relative ui-input-wrap">
                <select
                  id="hotel-select"
                  value={hotelId}
                  onChange={(e) => setHotelId(e.target.value)}
                  className="w-full h-full appearance-none bg-transparent pl-3.5 pr-9 text-sm text-[#111827] focus:outline-none cursor-pointer"
                >
                  <option value="" className="bg-white text-[#6B7280]">
                    Select hotel ({allHotels.length})...
                  </option>
                  {hotelsByCity.map(([city, cityHotels]) => (
                    <optgroup
                      key={city}
                      label={`${city} (${cityHotels.length})`}
                      className="bg-white text-[#6B7280]"
                    >
                      {cityHotels.map((hotel) => (
                        <option
                          key={hotel.hotel_id}
                          value={hotel.hotel_id}
                          className="bg-white text-[#111827]"
                        >
                          {hotel.name} · {hotel.area} ({hotel.hotel_id})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 text-[#6B7280] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {isQuoting && (
              <div className="bg-[#F8F9FB] border border-[#E5E7EB] rounded-[6px] p-4 text-sm text-[#6B7280]">
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
                  <span className="text-sm font-medium text-[#6B7280]">
                    Suggested Route Range (R3)
                  </span>
                  <span className="font-mono text-base font-bold text-[#2563EB]">
                    {formatInr(quote.price_min_inr)} – {formatInr(quote.price_max_inr)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-[#E5E7EB] text-xs">
                  <div>
                    <span className="text-[#6B7280] block mb-0.5">Earliest Pickup (R2)</span>
                    <span className="font-mono font-medium text-[#111827]">
                      {formatDateTimeLabel(quote.earliest_pickup)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#6B7280] block mb-0.5">Route Distance</span>
                    <span className="font-mono font-medium text-[#111827]">
                      {quote.drive_minutes}m · {quote.distance_km} km
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-[#6B7280]">Quick price:</span>
                  <button
                    type="button"
                    onClick={() => setPriceInr(String(quote.price_min_inr))}
                    className="px-2.5 py-1 rounded-[6px] bg-white border border-[#D1D5DB] hover:border-[#2563EB] hover:text-[#2563EB] font-mono text-xs text-[#111827] cursor-pointer ui-interactive"
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
                    className="px-2.5 py-1 rounded-[6px] bg-white border border-[#D1D5DB] hover:border-[#2563EB] hover:text-[#2563EB] font-mono text-xs text-[#111827] cursor-pointer ui-interactive"
                  >
                    Mid {formatInr(Math.round((quote.price_min_inr + quote.price_max_inr) / 2))}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceInr(String(quote.price_max_inr))}
                    className="px-2.5 py-1 rounded-[6px] bg-white border border-[#D1D5DB] hover:border-[#2563EB] hover:text-[#2563EB] font-mono text-xs text-[#111827] cursor-pointer ui-interactive"
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
                  className="block text-sm font-medium text-[#111827] mb-1.5"
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
                  className="block text-sm font-medium text-[#111827] mb-1.5"
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
                  className="block text-sm font-medium text-[#111827] mb-1.5"
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
                <span className="text-sm font-medium text-[#111827]">
                  Children&apos;s Ages (0–17)
                </span>
                <button
                  type="button"
                  onClick={handleAddChild}
                  className="px-3 py-1.5 rounded-[6px] bg-white border border-[#D1D5DB] hover:bg-[#F8F9FB] hover:border-[#9CA3AF] text-xs font-medium text-[#111827] inline-flex items-center gap-1 cursor-pointer ui-interactive"
                >
                  <Plus className="h-3.5 w-3.5 text-[#2563EB]" />
                  <span>Add Child</span>
                </button>
              </div>

              {childAges.length === 0 ? (
                <p className="text-sm text-[#6B7280]">
                  No children added. Click &ldquo;Add Child&rdquo; to include child ages.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {childAges.map((age, index) => (
                    <div
                      key={index}
                      className="inline-flex items-center bg-white border border-[#D1D5DB] rounded-[6px] h-11 overflow-hidden focus-within:border-[#2563EB]"
                    >
                      <span className="px-2.5 text-xs font-medium text-[#6B7280] bg-[#F8F9FB] h-full inline-flex items-center border-r border-[#E5E7EB]">
                        #{index + 1}
                      </span>
                      <input
                        type="number"
                        aria-label={`Child ${index + 1} age`}
                        value={age}
                        onChange={(e) => handleUpdateChildAge(index, e.target.value)}
                        className="w-16 h-full px-2.5 bg-white font-mono text-sm text-[#111827] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveChild(index)}
                        aria-label={`Remove child ${index + 1}`}
                        className="h-full px-2.5 text-[#6B7280] hover:text-[#DC2626] hover:bg-[#FEF2F2] border-l border-[#E5E7EB] cursor-pointer ui-interactive"
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
                  className="text-sm font-medium text-[#111827]"
                >
                  Pickup Time (Optional · Local Airport Time)
                </label>
                <div className="flex items-center gap-3 text-xs font-medium">
                  {quote && (
                    <button
                      type="button"
                      onClick={() => setPickup(quote.earliest_pickup)}
                      className="text-[#2563EB] hover:underline cursor-pointer"
                    >
                      Use {quote.earliest_pickup.slice(11, 16)}
                    </button>
                  )}
                  {pickup && (
                    <button
                      type="button"
                      onClick={() => setPickup("")}
                      className="text-[#6B7280] hover:text-[#111827] cursor-pointer"
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
              <p className="text-xs text-[#6B7280] mt-1.5">
                Leave blank to default to landing + 60 minutes (R2).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="car-type-select"
                  className="block text-sm font-medium text-[#111827] mb-1.5"
                >
                  Car Type (Optional · G2)
                </label>
                <div className="relative ui-input-wrap">
                  <select
                    id="car-type-select"
                    value={carType}
                    onChange={(e) => setCarType(e.target.value)}
                    className="w-full h-full appearance-none bg-transparent pl-3.5 pr-8 text-sm text-[#111827] focus:outline-none cursor-pointer"
                  >
                    <option value="" className="bg-white text-[#111827]">
                      Any Car Type
                    </option>
                    <option value="HATCHBACK" className="bg-white text-[#111827]">
                      HATCHBACK
                    </option>
                    <option value="SEDAN" className="bg-white text-[#111827]">
                      SEDAN
                    </option>
                    <option value="SUV" className="bg-white text-[#111827]">
                      SUV
                    </option>
                    <option value="BUS" className="bg-white text-[#111827]">
                      BUS
                    </option>
                  </select>
                  <ChevronDown className="h-4 w-4 text-[#6B7280] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label
                  htmlFor="price-input"
                  className="block text-sm font-medium text-[#111827] mb-1.5"
                >
                  Your Offer Price (INR · R3)
                </label>
                <div className="relative">
                  <IndianRupee className="h-4 w-4 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="price-input"
                    type="number"
                    value={priceInr}
                    onChange={(e) => setPriceInr(e.target.value)}
                    placeholder="e.g. 12000"
                    className="ui-input w-full pl-9 pr-3.5 font-mono text-base placeholder:font-sans placeholder:text-[#6B7280]"
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
          <div className="ui-card flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#111827]">
                Ride Requests ({requests.length})
              </h2>
              <p className="text-sm text-[#6B7280] mt-0.5">
                Includes open requests, supplier eligibility diagnostics (M2), and assigned taxis.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadRequests()}
              className="ui-btn-secondary ui-focus px-4 text-sm inline-flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingRequests ? "animate-spin text-[#2563EB]" : "text-[#6B7280]"}`} />
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
                  className={`bg-white rounded-[8px] border overflow-hidden ui-card-hover ${
                    isExpanded ? "border-[#2563EB]" : "border-[#E5E7EB]"
                  }`}
                >
                  <div className="p-6 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-xs font-semibold text-[#111827] px-2.5 py-1 rounded-[6px] bg-[#F8F9FB] border border-[#E5E7EB]">
                          {item.request_id}
                        </span>
                        <span className="text-base font-bold text-[#111827]">
                          {item.traveler_name}
                        </span>
                        <span
                          className={
                            item.status === "BOOKED"
                              ? "ui-badge ui-badge-booked"
                              : "ui-badge ui-badge-pending"
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
                        <span className="font-mono text-lg font-bold text-[#111827] block">
                          {formatInr(item.price_inr)}
                        </span>
                        {item.route && (
                          <span className="font-mono text-xs text-[#6B7280] block">
                            Range {formatInr(item.route.price_min_inr)}–{formatInr(item.route.price_max_inr)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm text-[#6B7280]">
                      <div className="flex items-center gap-2">
                        <PlaneLanding className="h-4 w-4 text-[#2563EB] shrink-0" />
                        <span className="truncate text-[#111827] font-medium">
                          {item.flight
                            ? `${item.flight.flight_id} (${item.flight.from} → ${item.flight.to})`
                            : item.flight_id}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-[#2563EB] shrink-0" />
                        <span className="truncate text-[#111827] font-medium">
                          {item.hotel
                            ? `${item.hotel.name} · ${item.hotel.city} (${item.hotel.area})`
                            : item.hotel_id}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-[#6B7280] shrink-0" />
                        <span className="font-mono text-xs sm:text-sm">
                          Pickup {formatDateTimeLabel(item.pickup)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-[#6B7280] shrink-0" />
                        <span>
                          {item.adults} adult{item.adults === 1 ? "" : "s"}
                          {item.child_ages.length > 0
                            ? ` + ${item.child_ages.length} child (${item.child_ages.join(", ")}y)`
                            : ""}
                        </span>
                        <span className="text-[#D1D5DB]">·</span>
                        <Luggage className="h-4 w-4 text-[#6B7280] shrink-0" />
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

                    <div className="pt-4 border-t border-[#E5E7EB] flex flex-wrap items-center justify-between gap-3 text-sm">
                      <div>
                        {item.status === "BOOKED" && item.booking_number ? (
                          <button
                            type="button"
                            onClick={() => onOpenBooking(item.booking_number!)}
                            className="font-mono font-semibold text-[#2563EB] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>Booking #{item.booking_number}</span>
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        ) : isZeroSuppliers ? (
                          <span className="text-[#DC2626] font-medium">
                            0 eligible suppliers at {item.flight?.to ?? "arrival airport"}
                          </span>
                        ) : (
                          <span className="text-[#6B7280]">
                            {item.servability.servable_count} eligible supplier
                            {item.servability.servable_count === 1 ? "" : "s"} ·{" "}
                            <span className="font-mono font-semibold text-[#111827]">
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
                          <ChevronUp className="h-4 w-4 text-[#2563EB]" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-[#6B7280]" />
                        )}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-[#E5E7EB] bg-[#F8F9FB] p-6">
                      {isLoadingDetail ? (
                        <p className="text-sm text-[#6B7280]">Loading assigned taxis...</p>
                      ) : !expandedDetail || expandedDetail.offers.length === 0 ? (
                        <p className="text-sm text-[#6B7280]">
                          No taxi offers assigned yet. Switch to a Taxi Supplier workspace to assign a car and price.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-sm font-medium text-[#6B7280] mb-2">
                            Assigned Taxis ({expandedDetail.offers.length}) — Book &amp; Reject actions wire in Step 9:
                          </p>
                          {expandedDetail.offers.map((offer) => (
                            <div
                              key={offer.offer_id}
                              className="bg-white border border-[#E5E7EB] rounded-[8px] p-4 flex flex-wrap items-center justify-between gap-3"
                            >
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-base font-bold text-[#111827]">
                                    {offer.company_name}
                                  </span>
                                  {offer.company_rating !== null && (
                                    <span className="inline-flex items-center gap-1 font-mono text-xs text-[#6B7280]">
                                      <Star className="h-3.5 w-3.5 text-[#F59E0B] fill-[#F59E0B]" />
                                      {offer.company_rating.toFixed(1)}
                                    </span>
                                  )}
                                  <span className="ui-badge ui-badge-accent font-mono">
                                    {offer.vehicle?.type ?? offer.vehicle_id} · {offer.vehicle_id}
                                  </span>
                                </div>
                                {offer.vehicle && (
                                  <p className="font-mono text-xs text-[#6B7280]">
                                    {offer.vehicle.seats} seats · {offer.vehicle.large_bags}L / {offer.vehicle.small_bags}S bags · Status: {offer.status}
                                  </p>
                                )}
                              </div>

                              <div className="text-right">
                                <span className="font-mono text-base font-bold text-[#111827] block">
                                  {formatInr(offer.price_inr)}
                                </span>
                                <span
                                  className={`font-mono text-xs font-medium block ${
                                    offer.price_delta_inr <= 0
                                      ? "text-[#15803D]"
                                      : "text-[#6B7280]"
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
