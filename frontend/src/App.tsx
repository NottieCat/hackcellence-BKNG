import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CarTaxiFront,
  CheckCircle2,
  ChevronDown,
  Compass,
  PlaneLanding,
  RefreshCw,
  Search,
  ShieldCheck,
  Ticket
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ApiRuleError, fetchBootstrap } from "./api/client";
import type { BootstrapData, SupplierCompany } from "./api/client";
import { BlurText, SpotlightCard } from "./components/ui/MotionPrimitives";
import { BookingSummaryPage } from "./pages/BookingSummaryPage";
import { SupplierWorkspace } from "./pages/SupplierWorkspace";
import { TravelerWorkspace } from "./pages/TravelerWorkspace";

type ScreenMode = "home" | "traveler" | "supplier" | "booking";

const JAPAN_AIRPORTS = new Set(["NRT", "HND", "KIX"]);

const SPRING_PILL = {
  type: "spring" as const,
  stiffness: 380,
  damping: 30
};

function isJapanSupplier(company: SupplierCompany): boolean {
  return company.airports.some((code) => JAPAN_AIRPORTS.has(code));
}

function App() {
  const [screen, setScreen] = useState<ScreenMode>("home");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [bookingSearchInput, setBookingSearchInput] = useState<string>("");
  const [activeBookingNumber, setActiveBookingNumber] = useState<string>("");

  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const loadCatalog = useCallback(async () => {
    setIsSyncing(true);
    setSyncError(null);

    try {
      const catalogData = await fetchBootstrap();
      setBootstrap(catalogData);
    }
    catch (err) {
      if (err instanceof ApiRuleError) {
        setSyncError(err.message);
      }
      else {
        setSyncError("Could not connect to the AeroCab service on port 4000. Please verify the backend is running.");
      }
    }
    finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const suppliers = bootstrap?.suppliers ?? [];
  const activeSupplier = suppliers.find((s) => s.company_id === selectedSupplierId) ?? null;
  const japanSuppliers = suppliers.filter(isJapanSupplier);
  const uaeSuppliers = suppliers.filter((company) => !isJapanSupplier(company));
  const isSupplierMode = screen === "supplier";

  function switchScreen(next: ScreenMode): void {
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function handleOpenHome(): void {
    switchScreen("home");
  }

  function handleOpenTraveler(): void {
    switchScreen("traveler");
  }

  function handleChooseSupplier(companyId?: string): void {
    const resolvedId =
      companyId ||
      selectedSupplierId ||
      suppliers[0]?.company_id ||
      "TX-JP-01";
    setSelectedSupplierId(resolvedId);
    switchScreen("supplier");
  }

  function handleOpenPassTab(): void {
    switchScreen("booking");
  }

  function handleBookingLookupSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = bookingSearchInput.trim();
    if (!trimmed) {
      switchScreen("booking");
      return;
    }
    setActiveBookingNumber(trimmed);
    switchScreen("booking");
  }

  function handleOpenBookingByNumber(bookingNumber: string): void {
    const clean = bookingNumber.trim();
    setBookingSearchInput(clean);
    setActiveBookingNumber(clean);
    switchScreen("booking");
  }

  const featuredSuppliers = suppliers.slice(0, 3);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <header
        className={`sticky top-0 z-30 bg-white/92 backdrop-blur-md border-b border-[#E5E9F2] shadow-[0_1px_2px_rgba(15,23,42,0.03)] ${
          isSupplierMode ? "ui-top-teal" : "ui-top-indigo"
        }`}
      >
        <div className="max-w-[1160px] mx-auto px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 lg:gap-6 min-w-0">
            <button
              type="button"
              onClick={handleOpenHome}
              className="ui-interactive ui-focus flex items-center gap-2.5 text-left cursor-pointer group rounded-[10px] pr-1"
            >
              <div
                className={`h-9 w-9 ui-icon-circle border ui-interactive ${
                  isSupplierMode
                    ? "ui-icon-teal border-[#99F6E4] group-hover:border-[#0D9488]"
                    : "ui-icon-indigo border-[#C7D2FE] group-hover:border-[#4F46E5]"
                }`}
              >
                <CarTaxiFront className="h-[18px] w-[18px] stroke-[1.9]" />
              </div>
              <div>
                <span className="font-display font-bold text-[15px] tracking-tight text-[#0F172A] block leading-tight">
                  AeroCab
                </span>
                <span className="text-[11px] font-medium text-[#64748B] block leading-tight">
                  Airport Transfers
                </span>
              </div>
            </button>

            <nav
              aria-label="Primary navigation"
              className="inline-flex items-center p-1 rounded-[11px] bg-[#F1F5F9] border border-[#E2E8F0]"
            >
              <button
                type="button"
                onClick={handleOpenHome}
                className={`relative px-3 py-1.5 rounded-[8px] text-xs sm:text-sm font-semibold cursor-pointer transition-colors ${
                  screen === "home"
                    ? "text-[#0F172A]"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                {screen === "home" && (
                  <motion.span
                    layoutId="app-nav-pill"
                    transition={SPRING_PILL}
                    className="absolute inset-0 rounded-[8px] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] border border-[#E2E8F0]"
                  />
                )}
                <span className="relative z-10 inline-flex items-center gap-1.5">
                  <Compass className="h-3.5 w-3.5 text-[#4F46E5] hidden sm:inline" />
                  <span>Overview</span>
                </span>
              </button>

              <button
                type="button"
                onClick={handleOpenTraveler}
                className={`relative px-3 py-1.5 rounded-[8px] text-xs sm:text-sm font-semibold cursor-pointer transition-colors ${
                  screen === "traveler"
                    ? "text-[#4338CA]"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                {screen === "traveler" && (
                  <motion.span
                    layoutId="app-nav-pill"
                    transition={SPRING_PILL}
                    className="absolute inset-0 rounded-[8px] bg-white shadow-[0_1px_3px_rgba(79,70,229,0.12)] border border-[#C7D2FE]"
                  />
                )}
                <span className="relative z-10 inline-flex items-center gap-1.5">
                  <PlaneLanding className="h-3.5 w-3.5 text-[#4F46E5]" />
                  <span>Book a Ride</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleChooseSupplier()}
                className={`relative px-3 py-1.5 rounded-[8px] text-xs sm:text-sm font-semibold cursor-pointer transition-colors ${
                  screen === "supplier"
                    ? "text-[#0F766E]"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                {screen === "supplier" && (
                  <motion.span
                    layoutId="app-nav-pill"
                    transition={SPRING_PILL}
                    className="absolute inset-0 rounded-[8px] bg-white shadow-[0_1px_3px_rgba(13,148,136,0.12)] border border-[#99F6E4]"
                  />
                )}
                <span className="relative z-10 inline-flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-[#0D9488]" />
                  <span>Operator Desk</span>
                </span>
              </button>

              <button
                type="button"
                onClick={handleOpenPassTab}
                className={`relative px-3 py-1.5 rounded-[8px] text-xs sm:text-sm font-semibold cursor-pointer transition-colors ${
                  screen === "booking"
                    ? "text-[#4338CA]"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                {screen === "booking" && (
                  <motion.span
                    layoutId="app-nav-pill"
                    transition={SPRING_PILL}
                    className="absolute inset-0 rounded-[8px] bg-white shadow-[0_1px_3px_rgba(79,70,229,0.12)] border border-[#C7D2FE]"
                  />
                )}
                <span className="relative z-10 inline-flex items-center gap-1.5">
                  <Ticket className="h-3.5 w-3.5 text-[#4F46E5]" />
                  <span className="hidden md:inline">Transfer Pass</span>
                  <span className="md:hidden">Pass</span>
                </span>
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {screen === "supplier" && suppliers.length > 0 && (
              <div className="hidden lg:inline-flex items-center relative h-10 rounded-[9px] bg-[#F0FDFA] border border-[#99F6E4]">
                <select
                  aria-label="Switch operator company"
                  value={selectedSupplierId}
                  onChange={(e) => handleChooseSupplier(e.target.value)}
                  className="h-full appearance-none bg-transparent pl-3 pr-8 text-xs font-semibold text-[#0F766E] focus:outline-none cursor-pointer"
                >
                  {suppliers.map((company) => (
                    <option
                      key={company.company_id}
                      value={company.company_id}
                      className="bg-white text-[#0F172A]"
                    >
                      {company.name} ({company.airports.join(", ")})
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-3.5 w-3.5 text-[#0F766E] absolute right-2.5 pointer-events-none" />
              </div>
            )}

            <form onSubmit={handleBookingLookupSubmit} className="flex items-center gap-1.5">
              <div className="relative flex items-center">
                <Search className="h-3.5 w-3.5 text-[#64748B] absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={bookingSearchInput}
                  onChange={(e) => setBookingSearchInput(e.target.value)}
                  placeholder="10-digit Pass #"
                  aria-label="10-digit booking number"
                  className="h-10 rounded-[9px] bg-[#F8FAFC] border border-[#CBD5E1] focus:bg-white focus:border-[#4F46E5] focus:outline-none focus:ring-3 focus:ring-[#4F46E5]/15 w-36 sm:w-44 pl-8 pr-2.5 font-mono text-xs text-[#0F172A] placeholder:font-sans placeholder:text-[#64748B] ui-interactive"
                />
              </div>
              <button
                type="submit"
                className="ui-btn-secondary ui-focus px-3.5 text-xs cursor-pointer"
              >
                Lookup
              </button>
            </form>

            <button
              type="button"
              onClick={() => void loadCatalog()}
              title="Sync live data"
              aria-label="Sync live data"
              className="ui-btn-ghost ui-focus w-10 inline-flex items-center justify-center cursor-pointer"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  isSyncing
                    ? isSupplierMode
                      ? "animate-spin text-[#0D9488]"
                      : "animate-spin text-[#4F46E5]"
                    : "text-[#475569]"
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full bg-[#F8FAFC]">
        <div className="max-w-[1160px] mx-auto px-4 sm:px-8 py-8 sm:py-10">
          {syncError && (
            <div className="mb-7 ui-alert-error px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-sm text-[#BE123C]">
                <AlertCircle className="h-5 w-5 text-[#E11D48] shrink-0" />
                <span>{syncError}</span>
              </div>
              <button
                type="button"
                onClick={() => void loadCatalog()}
                className="ui-btn-ghost ui-focus px-4 text-xs cursor-pointer"
              >
                Retry Connection
              </button>
            </div>
          )}

          <motion.div
            key={screen}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {screen === "home" && (
              <section className="space-y-8">
                <div className="ui-hero-backdrop px-6 py-10 sm:px-12 sm:py-14 text-center">
                  <div className="max-w-3xl mx-auto">
                    <span className="ui-badge ui-badge-accent mb-4 uppercase tracking-wider">
                      <PlaneLanding className="h-3.5 w-3.5" />
                      <span>Japan &amp; UAE Airport Concierge</span>
                    </span>

                    <h1 className="text-3xl sm:text-[42px] font-extrabold leading-[1.14] text-[#0F172A]">
                      <BlurText text="Private airport pickups at your price, backed by verified local fleets." />
                    </h1>

                    <p className="text-base sm:text-lg text-[#475569] mt-4 max-w-2xl mx-auto leading-relaxed">
                      Share your arrival flight, hotel, and preferred fare within our live route guide. Local taxi operators respond with guaranteed-fit vehicles—you pick the exact car you want.
                    </p>

                    <div className="mt-7 pt-6 border-t border-[#E5E9F2]/80 flex flex-wrap items-center justify-center gap-x-7 gap-y-2.5 text-xs sm:text-sm text-[#475569]">
                      <span className="inline-flex items-center gap-2 font-medium">
                        <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
                        <span>Transparent route fare bounds</span>
                      </span>
                      <span className="inline-flex items-center gap-2 font-medium">
                        <ShieldCheck className="h-4 w-4 text-[#4F46E5]" />
                        <span>Guaranteed seat &amp; luggage fit</span>
                      </span>
                      <span className="inline-flex items-center gap-2 font-medium">
                        <Ticket className="h-4 w-4 text-[#0D9488]" />
                        <span>Instant 10-digit transfer pass</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white border border-[#E5E9F2] rounded-[13px] px-5 py-4 flex items-start gap-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                    <span className="h-8 w-8 rounded-full bg-[#EEF2FF] border border-[#C7D2FE] text-[#4F46E5] font-mono text-xs font-bold inline-flex items-center justify-center shrink-0 mt-0.5">
                      01
                    </span>
                    <div>
                      <h2 className="text-sm font-bold text-[#0F172A]">
                        Post Flight &amp; Offer Fare
                      </h2>
                      <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                        Choose your flight, hotel, passengers, and luggage with live INR fare guidance for your route.
                      </p>
                    </div>
                  </div>

                  <div className="bg-white border border-[#E5E9F2] rounded-[13px] px-5 py-4 flex items-start gap-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                    <span className="h-8 w-8 rounded-full bg-[#F0FDFA] border border-[#99F6E4] text-[#0D9488] font-mono text-xs font-bold inline-flex items-center justify-center shrink-0 mt-0.5">
                      02
                    </span>
                    <div>
                      <h2 className="text-sm font-bold text-[#0F172A]">
                        Operators Assign Vehicles
                      </h2>
                      <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                        Licensed fleets serving your airport and arrival window dispatch free cars with custom quotes.
                      </p>
                    </div>
                  </div>

                  <div className="bg-white border border-[#E5E9F2] rounded-[13px] px-5 py-4 flex items-start gap-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                    <span className="h-8 w-8 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#059669] font-mono text-xs font-bold inline-flex items-center justify-center shrink-0 mt-0.5">
                      03
                    </span>
                    <div>
                      <h2 className="text-sm font-bold text-[#0F172A]">
                        Book &amp; Get 10-Digit Pass
                      </h2>
                      <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                        Lock in your preferred vehicle in one click and request flight or pickup updates if schedules shift.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
                  <SpotlightCard
                    spotlightColor="rgba(79, 70, 229, 0.06)"
                    className="ui-card ui-top-indigo flex flex-col justify-between min-h-[340px]"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-5">
                        <div className="h-12 w-12 ui-icon-circle ui-icon-indigo border border-[#C7D2FE]">
                          <PlaneLanding className="h-6 w-6 stroke-[1.8]" />
                        </div>
                        <span className="ui-badge ui-badge-accent">For Passengers</span>
                      </div>

                      <h2 className="text-2xl font-bold text-[#0F172A]">
                        Book an Airport Transfer
                      </h2>
                      <p className="text-sm sm:text-base text-[#475569] mt-2.5 leading-relaxed">
                        Name your fare within our route range, compare real vehicles from multiple local fleets, and confirm your ride with zero hidden fees.
                      </p>

                      <ul className="mt-5 space-y-2 text-xs sm:text-sm text-[#475569]">
                        <li className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#4F46E5]" />
                          <span>Instant route distance, drive time &amp; fair INR range</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#4F46E5]" />
                          <span>Sort offers by lowest fare or filter by Sedan, SUV &amp; Bus</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#4F46E5]" />
                          <span>Easy flight &amp; pickup rescheduling after booking</span>
                        </li>
                      </ul>
                    </div>

                    <div className="pt-6 mt-7 border-t border-[#E5E9F2]">
                      <button
                        type="button"
                        onClick={handleOpenTraveler}
                        className="ui-btn-primary ui-focus group w-full px-5 text-base flex items-center justify-between cursor-pointer"
                      >
                        <span>Request an Airport Ride</span>
                        <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-1" />
                      </button>
                    </div>
                  </SpotlightCard>

                  <SpotlightCard
                    spotlightColor="rgba(13, 148, 136, 0.06)"
                    className="ui-card ui-top-teal flex flex-col justify-between min-h-[340px]"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-5">
                        <div className="h-12 w-12 ui-icon-circle ui-icon-teal border border-[#99F6E4]">
                          <Building2 className="h-6 w-6 stroke-[1.8]" />
                        </div>
                        <span className="ui-badge ui-badge-teal">For Fleet Operators</span>
                      </div>

                      <h2 className="text-2xl font-bold text-[#0F172A]">
                        Taxi Operator Workspace
                      </h2>
                      <p className="text-sm sm:text-base text-[#475569] mt-2.5 leading-relaxed">
                        Open your fleet&apos;s private dispatch desk to view pre-qualified passenger requests, assign available vehicles, and approve schedule updates.
                      </p>

                      {featuredSuppliers.length > 0 && (
                        <div className="mt-5">
                          <span className="text-xs font-semibold text-[#64748B] block mb-2">
                            Quick-open active dispatch desks:
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {featuredSuppliers.map((company) => (
                              <button
                                key={company.company_id}
                                type="button"
                                onClick={() => handleChooseSupplier(company.company_id)}
                                className="px-3 py-1.5 rounded-[8px] bg-[#F0FDFA] hover:bg-[#CCFBF1] border border-[#99F6E4] text-xs font-semibold text-[#0F766E] inline-flex items-center gap-1.5 cursor-pointer ui-interactive"
                              >
                                <span>{company.name}</span>
                                <span className="font-mono text-[11px] text-[#0D9488]/80">
                                  ({company.airports[0]})
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-6 mt-7 border-t border-[#E5E9F2]">
                      <label
                        htmlFor="home-supplier-select"
                        className="text-xs font-semibold uppercase tracking-wider text-[#0F766E] block mb-2"
                      >
                        Choose Your Taxi Company
                      </label>
                      <div className="relative ui-input-wrap-teal">
                        <select
                          id="home-supplier-select"
                          value=""
                          disabled={suppliers.length === 0}
                          onChange={(e) => handleChooseSupplier(e.target.value)}
                          className="w-full h-full appearance-none bg-transparent pl-3.5 pr-10 text-sm sm:text-base font-medium text-[#0F172A] disabled:text-[#64748B] focus:outline-none cursor-pointer disabled:cursor-not-allowed"
                        >
                          <option value="" disabled className="bg-white text-[#64748B]">
                            {isSyncing && suppliers.length === 0
                              ? "Loading verified operators..."
                              : suppliers.length === 0
                                ? "Waiting for operator directory..."
                                : "Select from all 11 partner fleets..."}
                          </option>
                          {japanSuppliers.length > 0 && (
                            <optgroup
                              label="Japan (Tokyo · Osaka · Kyoto)"
                              className="bg-white text-[#64748B]"
                            >
                              {japanSuppliers.map((company) => (
                                <option
                                  key={company.company_id}
                                  value={company.company_id}
                                  className="bg-white text-[#0F172A]"
                                >
                                  {company.name} ({company.airports.join(", ")})
                                  {company.servable_open_count
                                    ? ` · ${company.servable_open_count} open`
                                    : ""}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {uaeSuppliers.length > 0 && (
                            <optgroup
                              label="United Arab Emirates (Dubai · Abu Dhabi)"
                              className="bg-white text-[#64748B]"
                            >
                              {uaeSuppliers.map((company) => (
                                <option
                                  key={company.company_id}
                                  value={company.company_id}
                                  className="bg-white text-[#0F172A]"
                                >
                                  {company.name} ({company.airports.join(", ")})
                                  {company.servable_open_count
                                    ? ` · ${company.servable_open_count} open`
                                    : ""}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        <ChevronDown className="h-4 w-4 text-[#0D9488] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </SpotlightCard>
                </div>
              </section>
            )}

            {screen === "traveler" && (
              <TravelerWorkspace
                bootstrap={bootstrap}
                onOpenBooking={handleOpenBookingByNumber}
                onSwitchToSupplier={handleChooseSupplier}
                onCatalogRefresh={() => void loadCatalog()}
              />
            )}

            {screen === "supplier" && (
              <SupplierWorkspace
                companyId={selectedSupplierId}
                allSuppliers={suppliers}
                fallbackCompany={activeSupplier}
                onSelectSupplier={handleChooseSupplier}
                onOpenBooking={handleOpenBookingByNumber}
                onSwitchToTraveler={handleOpenTraveler}
                onCatalogRefresh={() => void loadCatalog()}
              />
            )}

            {screen === "booking" && (
              <BookingSummaryPage
                bookingNumber={activeBookingNumber}
                bootstrap={bootstrap}
                onBackToTraveler={handleOpenTraveler}
                onOpenBooking={handleOpenBookingByNumber}
                onOpenSupplier={handleChooseSupplier}
              />
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}

export default App;
