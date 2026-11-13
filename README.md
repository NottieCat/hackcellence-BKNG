# AeroCab — Airport Taxi Ride Offers (Problem 2)

Full-stack airport transfer marketplace where arriving **Travelers** post ride requests at their target price within a route's suggested range, **Taxi Suppliers** privately review matching requests and assign available fleet cars with offers, and travelers compare, book, look up confirmed rides via a persistent **10-digit booking number**, and request post-booking flight or pickup changes.

---

## 1. How to Start the App (1–2 Commands)

### Prerequisites
- **Node.js** `v20+` and `npm`
- **MongoDB** running locally (`mongodb://127.0.0.1:27017/airport_taxi_offers`) or a **MongoDB Atlas** connection URI configured in `backend/.env`:
  ```bash
  cp backend/.env.example backend/.env
  # Edit backend/.env if using MongoDB Atlas:
  # PORT=4000
  # MONGODB_URI=<your-mongodb-uri>
  ```

### Single-Command Launch
```bash
./start.sh
```
- **Frontend UI:** `http://localhost:5173` (Vite proxies `/api/*` to `:4000`)
- **Backend API:** `http://localhost:4000/api/health`

*(Alternative 2-terminal startup if preferred: run `cd backend && npm install && npm run dev` in Terminal 1, and `cd frontend && npm install && npm run dev` in Terminal 2.)*

### Optional Automated Rule Verification (`R1–R9` & `M1–M7`)
With the backend running on `:4000`, execute the self-cleaning verification suite:
```bash
cd backend && npx tsx src/verifyRules.ts
```

---

## 2. Architecture & Data Model

```text
hackcellence-BKNG/
├── data/                         # Read-only reference JSON files (never modified on disk)
│   ├── shared/                   # airports.json, flights.json, hotels.json
│   └── problem-2/                # routes.json, taxi_companies.json, booked_rides.json, open_requests.json
├── backend/                      # Express + TypeScript + Mongoose REST API (:4000)
│   └── src/
│       ├── index.ts              # Express bootstrap, MongoDB connection (dbName: airport_taxi_offers)
│       ├── models/schemas.ts     # Typed Mongoose schemas & indexes for all collections
│       ├── seed/seedDatabase.ts  # Idempotent startup seeder ($set catalogs, $setOnInsert initial state)
│       ├── utils/time.ts         # Timezone-safe YYYY-MM-DDTHH:MM local airport time math
│       ├── services/ruleEngine.ts# Centralized R1–R9, M2, G2 validation & busy-window overlap engine
│       ├── routes/               # catalogRoutes, requestRoutes, supplierRoutes, bookingRoutes, changeRoutes
│       └── verifyRules.ts        # Self-cleaning 19-check HTTP assertion script
├── frontend/                     # React 19 + TypeScript + Vite + Tailwind CSS v4 (:5173)
│   └── src/
│       ├── api/client.ts         # Typed API client & ApiRuleError wrapper (zero hardcoded catalog data)
│       ├── App.tsx               # Role-aware navbar, 10-digit lookup, Traveler / private Supplier entry
│       └── pages/                # TravelerWorkspace.tsx, SupplierWorkspace.tsx, BookingSummaryPage.tsx
└── start.sh                      # 1-command dependency check + concurrent dev launcher
```

### Key Architectural Decisions
- **Backend-Enforced Business Logic:** Every rule (`R1–R9`, `M2`, `M6`, `G1`, `G2`, `G4`, `G5`) runs on the backend and returns structured `{ ok: false, error: { rule, code, message, details } }` payloads rendered directly in the UI.
- **Read-Only Dataset Integrity & Persistent State:** `seedDatabase.ts` reads `data/` into MongoDB on startup using `$set` upserts for reference catalogs (`airports`, `flights`, `hotels`, `routes`, `taxi_companies`) and `$setOnInsert` for stateful seed collections (`booked_rides`, `ride_requests`). All new requests, offers (`taxi_offers`), confirmed rides (`bookings`), and flight/pickup modifications (`change_requests`) persist in MongoDB across page reloads and server restarts without touching `data/` on disk.
- **Timezone-Safe Local Airport Time Arithmetic:** Because flight arrivals and supplier operating hours (`service_from`–`service_until`, including overnight spans such as `05:00–01:00`) are expressed in local airport wall-clock time (`YYYY-MM-DDTHH:MM`), `time.ts` computes minute offsets deterministically without host-browser timezone drift.

---

## 3. Completed Features & Rules

### Must-Have Features (`M1–M7`)
| ID | Feature | Status | Implementation Highlights |
|---|---|---|---|
| **M1** | Traveler posts ride request | Done | Enforces flight-hotel city/route match (`R1`), passenger/bag counts & child ages `0–17` (`R1`), pickup `>= landing + 60m` (`R2`), and price inside route INR range (`R3`). |
| **M2** | Matching requests & zero-supplier reason | Done | Supplier dashboard shows only open requests satisfying `R4`. When `0` suppliers qualify (e.g., `REQ-0002` at `KIX`), Traveler sees per-supplier disqualification reasons. |
| **M3** | Supplier assigns car & price | Done | Validates `R7` (`R3` price range, `R4` coverage/hours, `R5` seats & bags, `R6` busy window) and cites the exact broken rule on invalid attempts (`SC-1`, `SC-2`). |
| **M4** | Traveler views, books, or rejects offers | Done | Displays assigned taxis across suppliers; **Reject** marks an offer `REJECTED` (`R8`) while keeping the request open; **Book** confirms one car and marks sibling open offers `NOT_CHOSEN`. |
| **M5** | Persistent 10-digit booking summary | Done | Generates a collision-checked 10-digit `booking_number` (`1000000000–9999999999`); unknown numbers return `404` `"Booking not found"`. |
| **M6** | Sequential double-booking check | Done | Re-verifies `checkVehicleFreeR6` across `booked_rides` and `bookings` (`[pickup, pickup + 2 * drive_minutes]`) right before confirming a booking (`409 DOUBLE_BOOKING_PREVENTED`). |
| **M7** | Post-booking flight / pickup change | Done | Traveler submits new flight and/or pickup (`R1`, `R2`); supplier **Accepts** (re-validating `R4` & same-car `R6` with self-exclusion under `R9`) or **Rejects** (preserving original booking). |

### Good-to-Have & Stretch Features
| ID | Feature | Status | Implementation Highlights |
|---|---|---|---|
| **G1** | Multiple cars per supplier | Done | A supplier can submit offers for multiple distinct vehicles (e.g., `EP-1` and `EP-2`) on the same ride request at independent prices. |
| **G2** | Car type preference | Done | Traveler can optionally require `HATCHBACK`, `SEDAN`, `SUV`, or `BUS`; enforced in `R4` supplier matching and `R5` car assignment. |
| **G4** | Offer expiry | Done | Suppliers can attach an expiry duration (`expires_in_seconds`); expired `OPEN` offers lazily transition to `EXPIRED` and cannot be booked. |
| **G5** | Sort & filter assigned taxis | Done | Traveler drawer supports backend sorting (`price_asc` / `price_desc`) and car-type filtering (`?sort=...&carType=...`). |
| **S2** | Fleet schedule & price-delta insights | Done | Supplier workspace displays per-vehicle busy windows (`booked_rides` + `bookings`), and Traveler offer cards highlight INR delta vs. target price. |

---

## 4. Known Limitations

- **Shared Rides (`S1`) Out of Scope:** Stretch feature `S1` (multi-traveler ride sharing) was intentionally excluded to keep single-party booking and `R9` change-request invariants crisp and deterministic.
- **Sequential Availability Check (`M6`):** Per the problem FAQ, double-booking prevention performs a sequential availability check right before confirming a booking rather than distributed multi-document transactions or row-level locks.
- **Role Switcher Instead of Authentication / Payments:** Per the problem specification, users switch directly between the Traveler Portal, private Supplier company workspaces, and 10-digit Booking lookup without login walls or payment processing.
