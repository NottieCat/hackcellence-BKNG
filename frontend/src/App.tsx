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

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#111827]">
      <header className="sticky top-0 z-30 bg-white border-b border-[#E5E7EB]">
        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 h-18 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={handleOpenHome}
              className="ui-interactive ui-focus flex items-center gap-3 text-left cursor-pointer group rounded-[6px]"
            >
              <div className="h-10 w-10 rounded-[6px] bg-[#EFF6FF] border border-[#BFDBFE] group-hover:border-[#2563EB] flex items-center justify-center text-[#2563EB] ui-interactive">
                <CarTaxiFront className="h-5 w-5 stroke-[1.75]" />
              </div>
              <div>
                <span className="font-bold text-base tracking-tight text-[#111827] block leading-tight">
                  AeroCab
                </span>
                <span className="text-xs text-[#6B7280] block">
                  Airport Ride Offers
                </span>
              </div>
            </button>

            {screen !== "home" && (
              <div className="hidden sm:flex items-center gap-3 pl-4 border-l border-[#E5E7EB] text-sm font-medium text-[#6B7280] truncate">
                {screen === "traveler" && <span>Traveler Portal</span>}
                {screen === "supplier" && activeSupplier && (
                  <span>Supplier · {activeSupplier.name}</span>
                )}
                {screen === "booking" && (
                  <span className="font-mono text-[#111827]">Booking #{activeBookingNumber}</span>
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
                  className="h-full appearance-none bg-transparent pl-3.5 pr-9 text-sm font-medium text-[#111827] focus:outline-none cursor-pointer"
                >
                  {suppliers.map((company) => (
                    <option
                      key={company.company_id}
                      value={company.company_id}
                      className="bg-white text-[#111827]"
                    >
                      {company.name} ({company.airports.join(", ")})
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 text-[#6B7280] absolute right-3 pointer-events-none" />
              </div>
            )}

            <form onSubmit={handleBookingLookupSubmit} className="flex items-center gap-2">
              <div className="relative flex items-center">
                <Search className="h-4 w-4 text-[#6B7280] absolute left-3.5 pointer-events-none" />
                <input
                  type="text"
                  value={bookingSearchInput}
                  onChange={(e) => setBookingSearchInput(e.target.value)}
                  placeholder="Booking # (10 digits)"
                  aria-label="10-digit booking number"
                  className="ui-input w-44 sm:w-48 pl-9 pr-3 font-mono text-sm placeholder:font-sans placeholder:text-[#6B7280]"
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
                <ArrowLeft className="h-4 w-4 text-[#6B7280]" />
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
              <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin text-[#2563EB]" : "text-[#6B7280]"}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full bg-[#F8F9FB]">
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
            <section key="home-screen" className="panel-enter py-4 sm:py-8">
              <div className="text-center max-w-2xl mx-auto mb-12">
                <p className="inline-block ui-badge ui-badge-accent mb-3 uppercase tracking-wider">
                  Airport Transfers · Japan &amp; UAE
                </p>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#111827]">
                  Choose how you want to continue
                </h1>
                <p className="text-base text-[#6B7280] mt-3 leading-relaxed">
                  No sign-in required. Enter as a traveler to request an airport pickup at your price, or choose your taxi company to manage ride requests privately.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="ui-card ui-card-hover flex flex-col justify-between min-h-[320px]">
                  <div>
                    <div className="h-12 w-12 rounded-[8px] bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB] mb-6">
                      <PlaneLanding className="h-6 w-6 stroke-[1.75]" />
                    </div>
                    <h2 className="text-2xl font-bold text-[#111827] tracking-tight">
                      Traveler
                    </h2>
                    <p className="text-base text-[#6B7280] mt-3 leading-relaxed">
                      Select your arrival flight and hotel, see the suggested price range for your route, and book or reject offers from taxi suppliers.
                    </p>
                  </div>

                  <div className="pt-6 mt-8 border-t border-[#E5E7EB]">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7280] block mb-2">
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

                <div className="ui-card ui-card-hover flex flex-col justify-between min-h-[320px]">
                  <div>
                    <div className="h-12 w-12 rounded-[8px] bg-[#F8F9FB] border border-[#E5E7EB] flex items-center justify-center text-[#2563EB] mb-6">
                      <Building2 className="h-6 w-6 stroke-[1.75]" />
                    </div>
                    <h2 className="text-2xl font-bold text-[#111827] tracking-tight">
                      Taxi Supplier
                    </h2>
                    <p className="text-base text-[#6B7280] mt-3 leading-relaxed">
                      Select your company below to go directly to its private workspace — view matching ride requests, assign available cars, and handle flight changes.
                    </p>
                  </div>

                  <div className="pt-6 mt-8 border-t border-[#E5E7EB]">
                    <label
                      htmlFor="home-supplier-select"
                      className="text-xs font-semibold uppercase tracking-wider text-[#6B7280] block mb-2"
                    >
                      Select Supplier Company
                    </label>
                    <div className="relative ui-input-wrap">
                      <select
                        id="home-supplier-select"
                        value=""
                        disabled={suppliers.length === 0}
                        onChange={(e) => handleChooseSupplier(e.target.value)}
                        className="w-full h-full appearance-none bg-transparent pl-3.5 pr-10 text-base font-medium text-[#111827] disabled:text-[#6B7280] focus:outline-none cursor-pointer disabled:cursor-not-allowed"
                      >
                        <option value="" disabled className="bg-white text-[#6B7280]">
                          {isSyncing && suppliers.length === 0
                            ? "Loading companies..."
                            : suppliers.length === 0
                              ? "Waiting for backend catalog..."
                              : "Choose your taxi company..."}
                        </option>
                        {japanSuppliers.length > 0 && (
                          <optgroup
                            label="Japan (NRT · HND · KIX)"
                            className="bg-white text-[#6B7280]"
                          >
                            {japanSuppliers.map((company) => (
                              <option
                                key={company.company_id}
                                value={company.company_id}
                                className="bg-white text-[#111827]"
                              >
                                {company.name} ({company.airports.join(", ")})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {uaeSuppliers.length > 0 && (
                          <optgroup
                            label="UAE (DXB · AUH)"
                            className="bg-white text-[#6B7280]"
                          >
                            {uaeSuppliers.map((company) => (
                              <option
                                key={company.company_id}
                                value={company.company_id}
                                className="bg-white text-[#111827]"
                              >
                                {company.name} ({company.airports.join(", ")})
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <ChevronDown className="h-4 w-4 text-[#2563EB] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
            <section key="booking-screen" className="panel-enter space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E5E7EB] pb-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#2563EB] mb-1.5">
                    Booking Summary
                  </p>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#111827] font-mono">
                    Booking #{activeBookingNumber}
                  </h1>
                </div>
              </div>
              <div className="ui-card">
                <p className="text-base text-[#6B7280]">
                  10-digit booking details and flight/pickup change requests will mount here in Step 9.
                </p>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
