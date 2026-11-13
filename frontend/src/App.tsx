import { Building2, CarTaxiFront, PlaneLanding, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ApiRuleError, fetchBootstrap, fetchHealth } from "./api/client";
import type { ActiveView, BootstrapData, HealthData } from "./api/client";

function App() {
  const [activeView, setActiveView] = useState<ActiveView>("traveler");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [bookingSearchInput, setBookingSearchInput] = useState<string>("");
  const [activeBookingNumber, setActiveBookingNumber] = useState<string>("");

  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const loadAppShell = useCallback(async () => {
    setIsSyncing(true);
    setSyncError(null);

    try {
      const healthData = await fetchHealth();
      setHealth(healthData);
    }
    catch {
      setHealth(null);
    }

    try {
      const catalogData = await fetchBootstrap();
      setBootstrap(catalogData);
      if (catalogData.suppliers.length > 0) {
        setSelectedSupplierId((prev) => prev || catalogData.suppliers[0].company_id);
      }
    }
    catch (err) {
      if (err instanceof ApiRuleError) {
        setSyncError(err.message);
      }
      else {
        setSyncError("Backend catalog API (/api/catalog/bootstrap) is not reachable yet.");
      }
    }
    finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    void loadAppShell();
  }, [loadAppShell]);

  function handleSelectTraveler(): void {
    setActiveView("traveler");
  }

  function handleSupplierChange(companyId: string): void {
    setSelectedSupplierId(companyId);
    if (companyId) {
      setActiveView("supplier");
    }
  }

  function handleBookingLookupSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = bookingSearchInput.trim();
    if (!trimmed) {
      return;
    }
    setActiveBookingNumber(trimmed);
    setActiveView("booking");
  }

  const suppliers = bootstrap?.suppliers ?? [];
  const activeSupplier = suppliers.find((s) => s.company_id === selectedSupplierId) ?? null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <CarTaxiFront className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-slate-900">
                  AeroCab Offers
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                    health?.mongoConnected
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      health?.mongoConnected ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  {health?.mongoConnected ? "API & Mongo Ready" : "API Pending"}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Airport Taxi → Ride Offers Platform (Japan &amp; UAE)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleSelectTraveler}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                activeView === "traveler"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <PlaneLanding className="h-4 w-4" />
              Traveler Portal
            </button>

            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm transition ${
                activeView === "supplier"
                  ? "border-indigo-600 bg-indigo-50/70 text-indigo-900"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <Building2 className="h-4 w-4 text-indigo-600 shrink-0" />
              <label htmlFor="supplier-persona-select" className="sr-only">
                Act as Taxi Supplier
              </label>
              <select
                id="supplier-persona-select"
                value={activeView === "supplier" ? selectedSupplierId : ""}
                onChange={(e) => handleSupplierChange(e.target.value)}
                className="bg-transparent text-sm font-medium focus:outline-none pr-1 cursor-pointer"
              >
                <option value="" disabled>
                  {suppliers.length > 0
                    ? `Act as Supplier (${suppliers.length})...`
                    : "Suppliers (awaiting catalog API)..."}
                </option>
                {suppliers.map((company) => {
                  const openBadge =
                    company.servable_open_count !== undefined
                      ? ` · ${company.servable_open_count} open`
                      : "";
                  const changeBadge =
                    company.pending_changes_count
                      ? ` · ${company.pending_changes_count} chg`
                      : "";
                  return (
                    <option key={company.company_id} value={company.company_id}>
                      {company.name} ({company.airports.join(",")}){openBadge}{changeBadge}
                    </option>
                  );
                })}
              </select>
            </div>

            <form onSubmit={handleBookingLookupSubmit} className="flex items-center">
              <div className="relative flex items-center">
                <Search className="h-4 w-4 text-slate-400 absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={bookingSearchInput}
                  onChange={(e) => setBookingSearchInput(e.target.value)}
                  placeholder="10-digit booking #"
                  aria-label="10-digit booking number"
                  className="pl-8 pr-2.5 py-1.5 w-44 text-sm bg-white border border-slate-200 rounded-l-lg focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 text-sm font-medium bg-slate-800 text-white rounded-r-lg hover:bg-slate-900 transition cursor-pointer"
                >
                  Open
                </button>
              </div>
            </form>

            <button
              type="button"
              onClick={() => void loadAppShell()}
              title="Refresh state from backend"
              className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-4">
        {syncError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start justify-between gap-3 text-sm text-amber-900">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Backend Catalog Pending</p>
                <p className="text-amber-800">{syncError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadAppShell()}
              className="px-3 py-1 rounded-md bg-amber-100 hover:bg-amber-200 font-medium text-xs shrink-0 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {activeView === "traveler" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                  Flow 1 · Traveler
                </span>
                <h1 className="text-xl font-bold text-slate-900 mt-0.5">
                  Request an Airport Ride &amp; Compare Supplier Offers
                </h1>
              </div>
              {bootstrap && (
                <div className="text-xs text-slate-500 text-right">
                  <div>{bootstrap.flights.length} arrival flights loaded</div>
                  <div>{bootstrap.hotels.length} partner hotels loaded</div>
                </div>
              )}
            </div>
            <p className="text-sm text-slate-600">
              Traveler ride request form (M1, G2) and live supplier offers view (M4, G5) will mount here in Step 7 &amp; Step 9.
            </p>
          </section>
        )}

        {activeView === "supplier" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="border-b border-slate-100 pb-4 mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                Flow 2 · Taxi Supplier
              </span>
              <h1 className="text-xl font-bold text-slate-900 mt-0.5">
                {activeSupplier
                  ? `${activeSupplier.name} (${activeSupplier.company_id})`
                  : "Supplier Dashboard"}
              </h1>
              {activeSupplier && (
                <p className="text-xs text-slate-500 mt-1">
                  Airports: {activeSupplier.airports.join(", ")} · Hours: {activeSupplier.service_from}–{activeSupplier.service_until} · Fleet: {activeSupplier.vehicles.length} vehicles
                </p>
              )}
            </div>
            <p className="text-sm text-slate-600">
              Servable open requests (R4), vehicle assignment form (M3, R7, G1, G4), and fleet timeline (S2) will mount here in Step 8.
            </p>
          </section>
        )}

        {activeView === "booking" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="border-b border-slate-100 pb-4 mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                Booking Lookup (M5 &amp; M7)
              </span>
              <h1 className="text-xl font-bold text-slate-900 mt-0.5">
                Booking #{activeBookingNumber}
              </h1>
            </div>
            <p className="text-sm text-slate-600">
              10-digit booking summary (M5) and flight/pickup change workflow (M7, R9) will mount here in Step 9.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
