> Built by **Divya Vijayakumar** — an M.Tech Software Engineering student at VIT 
> **with a genuine interest in healthcare technology and backend systems.** I approached 
> this exercise not as a test to pass, but as a real engineering problem to solve 
> correctly — which is why the concurrency solution is atomic SQL, not a workaround.

> Allo Health's mission resonates with me personally — I wrote about this in my 
> application. That context made me care about getting the reservation logic right: 
> a patient trying to book a consultation shouldn't lose their slot to a race condition.

> I completed this end-to-end in a single focused session — data model → API → 
> frontend → deployment — committing as I went so the git history reflects how 
> I actually think through a problem, not a cleaned-up after-the-fact version.
# Allo Inventory — Take-Home Exercise
DIVYA V
22MIS0103

> Multi-warehouse inventory reservation system with race-condition-free stock management.

**Live URL:** https://allo-inventory-henna.vercel.app  
**GitHub:** https://github.com/Divya-Vijay02/allo-inventory

**"EVIDENCE Screenshots" doc:** https://drive.google.com/file/d/1r4S_eKkI255fGkhfD0a6nXQV46CcLpWi/view?usp=sharing

---

## What this does

A customer clicks **Reserve** on a product. The system holds that unit for **10 minutes** while they complete payment. If they confirm → stock is permanently decremented. If they cancel or the timer runs out → the hold is released and the unit returns to available inventory.

The hard part: two customers clicking Reserve simultaneously for the last unit. Exactly one should succeed. The other should get a 409. This is guaranteed at the database level — no application-level locks, no race conditions.

**Stock counts update on page refresh:** The product listing fetches stock from the database on each page load. After a reservation is made, it shows the updated available count — reserved units are correctly reflected in real time in the database, and the UI updates on next load.

---

## Running Locally

### Prerequisites
- Node.js 18+
- Hosted Postgres (Neon / Supabase / Railway — free tier works)

### 1. Clone and install

```bash
git clone https://github.com/Divya-Vijay02/allo-inventory.git
cd allo-inventory
npm install
```

### 2. Environment variables

Create `.env.local` in the project root:

```env
DATABASE_URL="postgresql://neondb_owner:npg_itKyoJNDs02W@ep-floral-bread-aq0zuqdm-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
CRON_SECRET="any-random-string"
```

### 3. Push schema and seed

```bash
npx prisma db push
npx tsx prisma/seed.ts
```

### 4. Run

```bash
npm run dev
# → http://localhost:3000
```

---

## How I solved the core problem: Concurrency

> "If two requests come in simultaneously for the last unit of a SKU, exactly one should succeed and the other should get a 409."

### The solution — atomic conditional UPDATE

```sql
UPDATE "Stock"
SET reserved = reserved + $quantity
WHERE "productId" = $productId
  AND "warehouseId" = $warehouseId
  AND (total - reserved) >= $quantity
```

This single SQL statement **checks availability and acquires the reservation atomically**. PostgreSQL guarantees row-level atomicity for UPDATE — two concurrent transactions cannot both observe the same pre-update `reserved` value for the same row.

### What happens in a race for the last unit

| Time | Request A | Request B |
|------|-----------|-----------|
| T0 | enters UPDATE | enters UPDATE |
| T1 | acquires row lock | waits |
| T2 | `(total - reserved) = 1 >= 1` ✓ | — |
| T3 | sets `reserved = 1`, commits | row lock released |
| T4 | — | `(total - reserved) = 0 >= 1` ✗ |
| T5 | — | 0 rows updated → **409** |

Exactly one succeeds. Guaranteed.

### Why not SELECT FOR UPDATE?

`SELECT FOR UPDATE` + a separate UPDATE is also correct but needs two round-trips and holds the lock longer. The conditional UPDATE is one round-trip — better throughput under load.

### Why not Redis Redlock?

Adds network latency, a failure mode (Redis down = reservations down), and operational complexity. For a single Postgres instance, the DB already provides all the atomicity guarantees we need. Redlock only makes sense when sharding across multiple Postgres nodes.

---

## API Reference

| Method | Path | Behaviour |
|--------|------|-----------|
| GET | `/api/products` | List products with available stock per warehouse |
| GET | `/api/warehouses` | List warehouses |
| POST | `/api/reservations` | Reserve units — **409** if insufficient stock |
| POST | `/api/reservations/:id/confirm` | Confirm reservation — **410** if expired |
| POST | `/api/reservations/:id/release` | Release reservation early |
| GET | `/api/cron/release-expired` | Internal — releases all expired PENDING reservations |

All POST endpoints accept an optional `Idempotency-Key` header (see Bonus section).

---

## Data Model

```
Warehouse      Product
    │              │
    └──── Stock ───┘
           │  total       ← physical units
           │  reserved    ← held by PENDING reservations
           │  available = total - reserved
           │
      Reservation
           │  status: PENDING → CONFIRMED | RELEASED
           │  expiresAt: DateTime
           │  idempotencyKey: String (unique, optional)
```

Stock invariant that must always hold:
```
reserved ≤ total
available = total - reserved ≥ 0
```
### Tables Created

| Table | Maps To | Description |
|-------|---------|-------------|
| `Product` | Products table | Name, SKU, price, description |
| `Warehouse` | Warehouse table | Name and location |
| `Stock` | Inventory table | Units per product per warehouse — tracks `total` and `reserved` separately |
| `Reservation` | Reservation table | Status (PENDING/CONFIRMED/RELEASED) and expiry timestamp |
| `IdempotencyRecord` | Bonus table | Caches responses for idempotency key support |

---

## Reservation Expiry

Reservations have a 10-minute TTL. Two mechanisms handle cleanup:

### 1. Vercel Cron (primary)

`vercel.json` schedules `GET /api/cron/release-expired` to run once daily (Hobby plan limit). The endpoint:
1. Finds all `PENDING` reservations where `expiresAt < NOW()`
2. Marks them `RELEASED` in bulk
3. Decrements `reserved` on the corresponding Stock rows
4. All in a single Postgres transaction

### 2. Lazy cleanup on confirm (secondary — always correct)

When `POST /api/reservations/:id/confirm` is called, the server re-checks `expiresAt` before confirming. If expired → releases stock immediately, returns `410 Gone`.

This means the system is **always correct** even if the cron hasn't run yet. The cron is an optimisation (returns stock sooner), not a correctness requirement.

---

## Bonus — Idempotency

`POST /api/reservations` and `POST /api/reservations/:id/confirm` support the `Idempotency-Key` header.

**How it works:**
1. Check `IdempotencyRecord` table for the key
2. If found → return cached `{ statusCode, body }` with `Idempotency-Replayed: true` header — no side effects
3. If not found → run handler, store result, return it

**Concurrent requests with the same key:** Both miss the cache check and both try to INSERT. The `UNIQUE` constraint on `IdempotencyRecord.key` makes the second INSERT fail — we catch the error, fetch the stored record, and return it.

**Storage — Postgres over Redis:** Redis would be better in production (lower latency, native TTL), but Postgres keeps the free-tier setup simple. Documented as a known trade-off.

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                           # Product listing (server component)
│   ├── checkout/[id]/page.tsx             # Checkout page
│   └── api/
│       ├── products/route.ts              # GET /api/products
│       ├── warehouses/route.ts            # GET /api/warehouses
│       ├── reservations/
│       │   ├── route.ts                   # POST /api/reservations
│       │   └── [id]/
│       │       ├── confirm/route.ts       # POST /api/reservations/:id/confirm
│       │       └── release/route.ts       # POST /api/reservations/:id/release
│       └── cron/release-expired/route.ts  # Expiry cleanup
├── components/
│   ├── product-card.tsx                   # Warehouse selector + reserve button
│   └── checkout-client.tsx               # Live countdown + confirm/cancel
└── lib/
    ├── reservation-service.ts            # ← Core logic — read this first
    ├── idempotency.ts                    # Idempotency middleware
    ├── prisma.ts                         # Prisma singleton
    ├── schemas.ts                        # Zod schemas + shared types
    └── utils.ts                          # Formatting helpers
```

**Start reading at `src/lib/reservation-service.ts`** — that's where all the interesting concurrency logic lives.

---

## Trade-offs and what I'd do differently

**Given more time:**

1. **Wrap confirm in SELECT FOR UPDATE** — the confirm flow checks expiry in application code. A more defensive implementation would use `SELECT ... FOR UPDATE` to eliminate the TOCTOU window between the expiry check and the status UPDATE.

2. **Multi-quantity UI** — the backend correctly handles `quantity > 1` but the UI always reserves 1 unit. Easy to extend.

3. **Real-time stock updates** — the product listing reflects stock at page-load time. WebSockets or polling would keep counts live as other users reserve units.

4. **Redis for idempotency** — lower latency reads and native TTL support for automatic key expiry.

5. **Auth** — reservations aren't scoped to a user/session. A real system would tie reservations to authenticated users.

6. **Observability** — structured logging + metrics for reservation attempt rate, conflict rate (409s), and expiry rate would be essential in production.

**Intentional simplifications:**
- No payment provider — `confirm` simulates payment success
- Cron runs daily (Hobby plan limit) — would be every 2 minutes on Pro
- No auth — out of scope for the exercise

---

## Seeded demo data

The seed includes intentionally scarce stock to make race conditions easy to test:

| Product | Warehouse | Stock |
|---------|-----------|-------|
| AirPods Pro 3rd Gen | Bengaluru | **1** ← open 2 tabs, race for it |
| Keychron Q1 Pro | Delhi | **1** ← open 2 tabs, race for it |
| Sony WH-1000XM5 | Mumbai | **0** ← out of stock demo |

**To demo the race condition:** Open `https://allo-inventory-henna.vercel.app` in two browser tabs simultaneously, navigate to AirPods Pro, select Bengaluru warehouse in both tabs, and click Reserve in both at the same time. One gets the reservation. The other sees a 409.