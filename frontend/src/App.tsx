import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CarTaxiFront,
  ChevronDown,
  PlaneLanding,
  RefreshCw,
  Search
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ApiRuleError, fetchBootstrap } from "./api/client";
import type { BootstrapData, SupplierCompany } from "./api/client";
import { BookingSummaryPage } from "./pages/BookingSummaryPage";
import { SupplierWorkspace } from "./pages/SupplierWorkspace";
import { TravelerWorkspace } from "./pages/TravelerWorkspace";

type ScreenMode = "home" | "traveler" | "supplier" | "booking";

const JAPAN_AIRPORTS = new Set(["NRT", "HND", "KIX"]);

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
        setSyncError("Could not reach the backend server on port 4000. Make sure backend is running.");
      }
    }
    finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  function handleOpenHome(): void {
    setScreen("home");
  }

  function handleOpenTraveler(): void {
    setScreen("traveler");
  }

  function handleChooseSupplier(companyId: string): void {
    if (!companyId) {
      return;
    }
    setSelectedSupplierId(companyId);
    setScreen("supplier");
  }

  function handleBookingLookupSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = bookingSearchInput.trim();
    if (!trimmed) {
      return;
    }
    setActiveBookingNumber(trimmed);
    setScreen("booking");
  }

  function handleOpenBookingByNumber(bookingNumber: string): void {
    setBookingSearchInput(bookingNumber);
    setActiveBookingNumber(bookingNumber);
    setScreen("booking");
  }

  const suppliers = bootstrap?.suppliers ?? [];
  const activeSupplier = suppliers.find((s) => s.company_id === selectedSupplierId) ?? null;
  const japanSuppliers = suppliers.filter(isJapanSupplier);
  const uaeSuppliers = suppliers.filter((company) => !isJapanSupplier(company));
  const isSupplierMode = screen === "supplier";

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6FB] text-[#0F172A]">
      <header
        className={`sticky top-0 z-30 bg-white border-b border-[#E2E8F0] shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${
          isSupplierMode ? "ui-top-teal" : "ui-top-indigo"
        }`}
      >
        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 h-18 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={handleOpenHome}
              className="ui-interactive ui-focus flex items-center gap-3 text-left cursor-pointer group rounded-[6px]"
            >
              <div
                className={`h-10 w-10 ui-icon-circle border ui-interactive ${
                  isSupplierMode
                    ? "ui-icon-teal border-[#99F6E4] group-hover:border-[#0F766E]"
                    : "ui-icon-indigo border-[#C7D2FE] group-hover:border-[#4F46E5]"
                }`}
              >
                <CarTaxiFront className="h-5 w-5 stroke-[1.85]" />
              </div>
              <div>
                <span className="font-bold text-base tracking-tight text-[#0F172A] block leading-tight">
                  AeroCab
                </span>
                <span className="text-xs text-[#64748B] block">
                  Airport Ride Offers
                </span>
              </div>
            </button>

            {screen !== "home" && (
              <div className="hidden sm:flex items-center gap-2.5 pl-4 border-l border-[#E2E8F0] truncate">
                {screen === "traveler" && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE]">
                    <PlaneLanding className="h-3.5 w-3.5" />
                    <span>Traveler Portal</span>
                  </span>
                )}
                {screen === "supplier" && activeSupplier && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4]">
                    <Building2 className="h-3.5 w-3.5" />
                    <span>Supplier · {activeSupplier.name}</span>
                  </span>
                )}
                {screen === "booking" && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold font-mono bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE]">
                    Booking #{activeBookingNumber}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {screen === "supplier" && suppliers.length > 0 && (
              <div className="hidden md:inline-flex items-center relative ui-input-wrap">
                <select
                  aria-label="Switch supplier company"
                  value={selectedSupplierId}
                  onChange={(e) => handleChooseSupplier(e.target.value)}
                  className="h-full appearance-none bg-transparent pl-3.5 pr-9 text-sm font-medium text-[#0F172A] focus:outline-none cursor-pointer"
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
                <ChevronDown className="h-4 w-4 text-[#0F766E] absolute right-3 pointer-events-none" />
              </div>
            )}

            <form onSubmit={handleBookingLookupSubmit} className="flex items-center gap-2">
              <div className="relative flex items-center">
                <Search className="h-4 w-4 text-[#64748B] absolute left-3.5 pointer-events-none" />
                <input
                  type="text"
                  value={bookingSearchInput}
                  onChange={(e) => setBookingSearchInput(e.target.value)}
                  placeholder="Booking # (10 digits)"
                  aria-label="10-digit booking number"
                  className="ui-input w-44 sm:w-48 pl-9 pr-3 font-mono text-sm placeholder:font-sans placeholder:text-[#64748B]"
                />
              </div>
              <button
                type="submit"
                className="ui-btn-secondary ui-focus px-4 text-sm cursor-pointer"
              >
                Lookup
              </button>
            </form>

            {screen !== "home" && (
              <button
                type="button"
                onClick={handleOpenHome}
                className="ui-btn-secondary ui-focus px-3.5 text-sm inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Switch Role</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void loadCatalog()}
              title="Refresh data"
              aria-label="Refresh data"
              className="ui-btn-secondary ui-focus w-11 inline-flex items-center justify-center cursor-pointer"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  isSyncing
                    ? isSupplierMode
                      ? "animate-spin text-[#0F766E]"
                      : "animate-spin text-[#4F46E5]"
                    : ""
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full bg-[#F4F6FB]">
        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 py-10 sm:py-12">
          {syncError && (
            <div className="mb-8 ui-alert-error px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-sm text-[#991B1B]">
                <AlertCircle className="h-5 w-5 text-[#DC2626] shrink-0" />
                <span>{syncError}</span>
              </div>
              <button
                type="button"
                onClick={() => void loadCatalog()}
                className="ui-btn-secondary ui-focus px-4 text-sm cursor-pointer"
              >
                Try Again
              </button>
            </div>
          )}

          {screen === "home" && (
            <section key="home-screen" className="panel-enter space-y-10 py-2 sm:py-4">
              <div className="ui-hero-backdrop px-6 py-10 sm:px-10 sm:py-12 text-center">
                <div className="max-w-2xl mx-auto">
                  <p className="inline-block ui-badge ui-badge-accent mb-3.5 uppercase tracking-wider">
                    Airport Transfers · Japan &amp; UAE
                  </p>
                  <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0F172A]">
                    Choose how you want to continue
                  </h1>
                  <p className="text-base text-[#64748B] mt-3 leading-relaxed">
                    No sign-in required. Enter as a traveler to request an airport pickup at your price, or choose your taxi company to manage ride requests privately.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="ui-card ui-card-hover ui-top-indigo flex flex-col justify-between min-h-[320px]">
                  <div>
                    <div className="h-12 w-12 ui-icon-circle ui-icon-indigo border border-[#C7D2FE] mb-6">
                      <PlaneLanding className="h-6 w-6 stroke-[1.8]" />
                    </div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight">
                        Traveler
                      </h2>
                      <span className="ui-badge ui-badge-accent">Passenger</span>
                    </div>
                    <p className="text-base text-[#64748B] mt-3 leading-relaxed">
                      Select your arrival flight and hotel, see the suggested price range for your route, and book or reject offers from taxi suppliers.
                    </p>
                  </div>

                  <div className="pt-6 mt-8 border-t border-[#E2E8F0]">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#4F46E5] block mb-2">
                      Passenger Portal
                    </span>
                    <button
                      type="button"
                      onClick={handleOpenTraveler}
                      className="ui-btn-primary ui-focus group w-full px-5 text-base flex items-center justify-between cursor-pointer"
                    >
                      <span>Enter Traveler Portal</span>
                      <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                    </button>
                  </div>
                </div>

                <div className="ui-card ui-card-hover ui-top-teal flex flex-col justify-between min-h-[320px]">
                  <div>
                    <div className="h-12 w-12 ui-icon-circle ui-icon-teal border border-[#99F6E4] mb-6">
                      <Building2 className="h-6 w-6 stroke-[1.8]" />
                    </div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight">
                        Taxi Supplier
                      </h2>
                      <span className="ui-badge ui-badge-teal">Operator</span>
                    </div>
                    <p className="text-base text-[#64748B] mt-3 leading-relaxed">
                      Select your company below to go directly to its private workspace — view matching ride requests, assign available cars, and handle flight changes.
                    </p>
                  </div>

                  <div className="pt-6 mt-8 border-t border-[#E2E8F0]">
                    <label
                      htmlFor="home-supplier-select"
                      className="text-xs font-semibold uppercase tracking-wider text-[#0F766E] block mb-2"
                    >
                      Select Supplier Company
                    </label>
                    <div className="relative ui-input-wrap">
                      <select
                        id="home-supplier-select"
                        value=""
                        disabled={suppliers.length === 0}
                        onChange={(e) => handleChooseSupplier(e.target.value)}
                        className="w-full h-full appearance-none bg-transparent pl-3.5 pr-10 text-base font-medium text-[#0F172A] disabled:text-[#64748B] focus:outline-none cursor-pointer disabled:cursor-not-allowed"
                      >
                        <option value="" disabled className="bg-white text-[#64748B]">
                          {isSyncing && suppliers.length === 0
                            ? "Loading companies..."
                            : suppliers.length === 0
                              ? "Waiting for backend catalog..."
                              : "Choose your taxi company..."}
                        </option>
                        {japanSuppliers.length > 0 && (
                          <optgroup
                            label="Japan (NRT · HND · KIX)"
                            className="bg-white text-[#64748B]"
                          >
                            {japanSuppliers.map((company) => (
                              <option
                                key={company.company_id}
                                value={company.company_id}
                                className="bg-white text-[#0F172A]"
                              >
                                {company.name} ({company.airports.join(", ")})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {uaeSuppliers.length > 0 && (
                          <optgroup
                            label="UAE (DXB · AUH)"
                            className="bg-white text-[#64748B]"
                          >
                            {uaeSuppliers.map((company) => (
                              <option
                                key={company.company_id}
                                value={company.company_id}
                                className="bg-white text-[#0F172A]"
                              >
                                {company.name} ({company.airports.join(", ")})
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <ChevronDown className="h-4 w-4 text-[#0F766E] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {screen === "traveler" && (
            <TravelerWorkspace
              bootstrap={bootstrap}
              onOpenBooking={handleOpenBookingByNumber}
              onCatalogRefresh={() => void loadCatalog()}
            />
          )}

          {screen === "supplier" && (
            <SupplierWorkspace
              companyId={selectedSupplierId}
              fallbackCompany={activeSupplier}
              onOpenBooking={handleOpenBookingByNumber}
              onCatalogRefresh={() => void loadCatalog()}
            />
          )}

          {screen === "booking" && (
            <BookingSummaryPage
              bookingNumber={activeBookingNumber}
              bootstrap={bootstrap}
              onBackToTraveler={handleOpenTraveler}
              onOpenSupplier={handleChooseSupplier}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
