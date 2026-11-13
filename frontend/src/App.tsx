import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CarTaxiFront,
  ChevronDown,
  Clock,
  Luggage,
  MapPin,
  PlaneLanding,
  RefreshCw,
  Search,
  Star,
  Users
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ApiRuleError, fetchBootstrap } from "./api/client";
import type { BootstrapData, SupplierCompany } from "./api/client";
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
    <div className="min-h-screen flex flex-col bg-[#09090B] text-[#FAFAFA]">
      <header className="sticky top-0 z-30 bg-[#111113] border-b border-[#27272A]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={handleOpenHome}
              className="ui-interactive ui-focus flex items-center gap-3 text-left cursor-pointer group"
            >
              <div className="h-9 w-9 bg-[#18181B] border border-[#27272A] group-hover:border-[#A3E635] flex items-center justify-center text-[#A3E635] ui-interactive">
                <CarTaxiFront className="h-4 w-4 stroke-[1.75]" />
              </div>
              <div>
                <span className="font-semibold text-sm tracking-tight text-[#FAFAFA] block">
                  AeroCab
                </span>
                <span className="text-[11px] text-[#71717A] block">
                  Airport Ride Offers
                </span>
              </div>
            </button>

            {screen !== "home" && (
              <div className="hidden sm:flex items-center gap-3 pl-4 border-l border-[#27272A] text-xs text-[#A1A1AA] truncate">
                {screen === "traveler" && <span>Traveler Portal</span>}
                {screen === "supplier" && activeSupplier && (
                  <span>Supplier · {activeSupplier.name}</span>
                )}
                {screen === "booking" && (
                  <span className="font-mono">Booking #{activeBookingNumber}</span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {screen === "supplier" && suppliers.length > 0 && (
              <div className="hidden md:inline-flex items-center relative h-9 bg-[#18181B] border border-[#27272A] hover:border-[#3F3F46] ui-interactive">
                <select
                  aria-label="Switch supplier company"
                  value={selectedSupplierId}
                  onChange={(e) => handleChooseSupplier(e.target.value)}
                  className="ui-focus h-full appearance-none bg-transparent pl-3 pr-8 text-xs font-medium text-[#FAFAFA] focus:outline-none cursor-pointer"
                >
                  {suppliers.map((company) => (
                    <option
                      key={company.company_id}
                      value={company.company_id}
                      className="bg-[#18181B] text-[#FAFAFA]"
                    >
                      {company.name} ({company.airports.join(", ")})
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-3.5 w-3.5 text-[#71717A] absolute right-2.5 pointer-events-none" />
              </div>
            )}

            <form onSubmit={handleBookingLookupSubmit} className="flex items-center h-9">
              <div className="relative flex items-center h-full">
                <Search className="h-3.5 w-3.5 text-[#71717A] absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={bookingSearchInput}
                  onChange={(e) => setBookingSearchInput(e.target.value)}
                  placeholder="Booking # (10 digits)"
                  aria-label="10-digit booking number"
                  className="ui-interactive ui-focus h-full w-40 sm:w-44 pl-8 pr-2.5 bg-[#09090B] border border-[#27272A] focus:border-[#A3E635] font-mono text-xs text-[#FAFAFA] placeholder:font-sans placeholder:text-[#71717A] focus:outline-none"
                />
                <button
                  type="submit"
                  className="ui-interactive ui-focus h-full px-3 bg-[#18181B] border border-l-0 border-[#27272A] hover:bg-[#202024] hover:border-[#3F3F46] text-xs font-medium text-[#FAFAFA] cursor-pointer"
                >
                  Lookup
                </button>
              </div>
            </form>

            {screen !== "home" && (
              <button
                type="button"
                onClick={handleOpenHome}
                className="ui-interactive ui-focus h-9 px-3 bg-[#18181B] border border-[#27272A] hover:bg-[#202024] hover:border-[#3F3F46] text-xs font-medium text-[#A1A1AA] hover:text-[#FAFAFA] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Switch Role</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void loadCatalog()}
              title="Refresh data"
              aria-label="Refresh data"
              className="ui-interactive ui-focus h-9 w-9 inline-flex items-center justify-center bg-[#18181B] border border-[#27272A] hover:bg-[#202024] hover:border-[#3F3F46] text-[#A1A1AA] hover:text-[#FAFAFA] cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin text-[#A3E635]" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-5 sm:px-8 py-10">
        {syncError && (
          <div className="mb-8 bg-[#18181B] border border-[#27272A] border-l-2 border-l-[#FBBF24] px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-sm text-[#FAFAFA]">
              <AlertCircle className="h-4 w-4 text-[#FBBF24] shrink-0" />
              <span>{syncError}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadCatalog()}
              className="ui-interactive ui-focus px-3.5 py-1.5 bg-[#202024] border border-[#3F3F46] hover:border-[#A3E635] text-xs font-medium text-[#FAFAFA] cursor-pointer"
            >
              Try Again
            </button>
          </div>
        )}

        {screen === "home" && (
          <section key="home-screen" className="panel-enter max-w-4xl mx-auto pt-4 sm:pt-10">
            <div className="mb-10">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#A3E635] mb-2.5">
                Airport Transfers · Japan &amp; UAE
              </p>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#FAFAFA]">
                Choose how you want to continue
              </h1>
              <p className="text-sm sm:text-base text-[#A1A1AA] mt-2 max-w-xl leading-relaxed">
                No sign-in required. Enter as a traveler to request an airport pickup at your price, or choose your taxi company to manage ride requests privately.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#18181B] border border-[#27272A] hover:border-[#3F3F46] p-7 flex flex-col justify-between min-h-[290px] ui-interactive">
                <div>
                  <div className="h-11 w-11 bg-[#111113] border border-[#27272A] flex items-center justify-center text-[#A3E635] mb-6">
                    <PlaneLanding className="h-5 w-5 stroke-[1.75]" />
                  </div>
                  <h2 className="text-xl font-semibold text-[#FAFAFA] tracking-tight">
                    Traveler
                  </h2>
                  <p className="text-sm text-[#A1A1AA] mt-2.5 leading-relaxed">
                    Select your arrival flight and hotel, see the suggested price range for your route, and book or reject offers from taxi suppliers.
                  </p>
                </div>

                <div className="pt-6 mt-8 border-t border-[#27272A]">
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#71717A] block mb-2">
                    Passenger Portal
                  </span>
                  <button
                    type="button"
                    onClick={handleOpenTraveler}
                    className="ui-interactive ui-focus group w-full h-11 px-4 bg-[#A3E635] hover:bg-[#BEF264] text-[#09090B] font-semibold text-sm flex items-center justify-between cursor-pointer"
                  >
                    <span>Enter Traveler Portal</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                  </button>
                </div>
              </div>

              <div className="bg-[#18181B] border border-[#27272A] hover:border-[#3F3F46] p-7 flex flex-col justify-between min-h-[290px] ui-interactive">
                <div>
                  <div className="h-11 w-11 bg-[#111113] border border-[#27272A] flex items-center justify-center text-[#A3E635] mb-6">
                    <Building2 className="h-5 w-5 stroke-[1.75]" />
                  </div>
                  <h2 className="text-xl font-semibold text-[#FAFAFA] tracking-tight">
                    Taxi Supplier
                  </h2>
                  <p className="text-sm text-[#A1A1AA] mt-2.5 leading-relaxed">
                    Select your company below to go directly to its private workspace — view matching ride requests, assign available cars, and handle flight changes.
                  </p>
                </div>

                <div className="pt-6 mt-8 border-t border-[#27272A]">
                  <label
                    htmlFor="home-supplier-select"
                    className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#71717A] block mb-2"
                  >
                    Select Supplier Company
                  </label>
                  <div className="relative h-11 bg-[#111113] border border-[#27272A] hover:border-[#A3E635] focus-within:border-[#A3E635] ui-interactive">
                    <select
                      id="home-supplier-select"
                      value=""
                      disabled={suppliers.length === 0}
                      onChange={(e) => handleChooseSupplier(e.target.value)}
                      className="ui-focus w-full h-full appearance-none bg-transparent pl-3.5 pr-10 text-sm font-medium text-[#FAFAFA] disabled:text-[#71717A] focus:outline-none cursor-pointer disabled:cursor-not-allowed"
                    >
                      <option value="" disabled className="bg-[#18181B] text-[#71717A]">
                        {isSyncing && suppliers.length === 0
                          ? "Loading companies..."
                          : suppliers.length === 0
                            ? "Waiting for backend catalog..."
                            : "Choose your taxi company..."}
                      </option>
                      {japanSuppliers.length > 0 && (
                        <optgroup
                          label="Japan (NRT · HND · KIX)"
                          className="bg-[#18181B] text-[#A1A1AA]"
                        >
                          {japanSuppliers.map((company) => (
                            <option
                              key={company.company_id}
                              value={company.company_id}
                              className="bg-[#18181B] text-[#FAFAFA]"
                            >
                              {company.name} ({company.airports.join(", ")})
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {uaeSuppliers.length > 0 && (
                        <optgroup
                          label="UAE (DXB · AUH)"
                          className="bg-[#18181B] text-[#A1A1AA]"
                        >
                          {uaeSuppliers.map((company) => (
                            <option
                              key={company.company_id}
                              value={company.company_id}
                              className="bg-[#18181B] text-[#FAFAFA]"
                            >
                              {company.name} ({company.airports.join(", ")})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <ChevronDown className="h-4 w-4 text-[#A3E635] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
          <section key="supplier-screen" className="panel-enter space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#27272A] pb-5">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#A3E635] mb-1.5">
                  Supplier Workspace · {activeSupplier?.company_id}
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-[#FAFAFA]">
                  {activeSupplier ? activeSupplier.name : "Supplier Dashboard"}
                </h1>
              </div>

              {activeSupplier && (
                <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
                  <span className="px-3 py-1.5 bg-[#18181B] border border-[#27272A] text-[#FAFAFA] inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-[#A3E635]" />
                    Hours: {activeSupplier.service_from}–{activeSupplier.service_until}
                  </span>
                  <span className="px-3 py-1.5 bg-[#18181B] border border-[#27272A] text-[#FAFAFA] inline-flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 text-[#A3E635] fill-[#A3E635]" />
                    {activeSupplier.rating.toFixed(1)}
                  </span>
                </div>
              )}
            </div>

            {activeSupplier && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-[#18181B] border border-[#27272A] p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-[#FAFAFA] flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-[#A3E635]" />
                    Service Coverage
                  </h2>
                  <div>
                    <span className="text-xs text-[#71717A] block mb-2">Pickup Airports</span>
                    <div className="flex flex-wrap gap-1.5">
                      {activeSupplier.airports.map((code) => (
                        <span
                          key={code}
                          className="px-2.5 py-1 bg-[#111113] border border-[#27272A] font-mono text-xs text-[#FAFAFA]"
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-[#71717A] block mb-2">
                      Hotel Drop-off Areas ({activeSupplier.areas.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {activeSupplier.areas.map((zone) => (
                        <span
                          key={`${zone.city}-${zone.area}`}
                          className="px-2.5 py-1 bg-[#111113] border border-[#27272A] text-xs text-[#A1A1AA]"
                        >
                          {zone.city} · {zone.area}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-2 bg-[#18181B] border border-[#27272A] p-5">
                  <h2 className="text-sm font-semibold text-[#FAFAFA] mb-4">
                    Company Fleet ({activeSupplier.vehicles.length} cars)
                  </h2>
                  <div className="border border-[#27272A] overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#111113] border-b border-[#27272A] text-xs font-medium text-[#A1A1AA]">
                          <th className="py-2.5 px-4">Vehicle ID</th>
                          <th className="py-2.5 px-4">Type</th>
                          <th className="py-2.5 px-4">Seats</th>
                          <th className="py-2.5 px-4">Large Bags</th>
                          <th className="py-2.5 px-4">Small Bags</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#27272A] text-sm">
                        {activeSupplier.vehicles.map((car) => (
                          <tr key={car.vehicle_id} className="ui-interactive hover:bg-[#202024]">
                            <td className="py-3 px-4 font-mono text-xs font-medium text-[#FAFAFA]">
                              {car.vehicle_id}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-[#A3E635]">
                              {car.type}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-[#A1A1AA]">
                              <span className="inline-flex items-center gap-1.5">
                                <Users className="h-3.5 w-3.5 text-[#71717A]" />
                                {car.seats}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-[#A1A1AA]">
                              <span className="inline-flex items-center gap-1.5">
                                <Luggage className="h-3.5 w-3.5 text-[#71717A]" />
                                {car.large_bags}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-[#A1A1AA]">
                              {car.small_bags}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {screen === "booking" && (
          <section key="booking-screen" className="panel-enter space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#27272A] pb-5">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#A3E635] mb-1.5">
                  Booking Summary
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-[#FAFAFA] font-mono">
                  Booking #{activeBookingNumber}
                </h1>
              </div>
            </div>
            <div className="bg-[#18181B] border border-[#27272A] p-6">
              <p className="text-sm text-[#A1A1AA]">
                10-digit booking details and flight/pickup change requests will mount here in Step 9.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
