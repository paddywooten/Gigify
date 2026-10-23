# Gigify 🎵

A marketplace that connects **churches, venues and event organizers** with **reviewed local musicians** for gigs — with escrow-backed payments and a transparent, percentage-based platform commission.

Musicians browse gigs and apply with their rate. Organizers pick a musician, fund an escrow, and the platform releases the payout on completion, keeping its commission. Every money movement is recorded, disputes are mediated by admins, and both parties review each other afterwards.

---

## Table of contents

- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [What's implemented](#whats-implemented)
- [How the money works](#how-the-money-works)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [API reference](#api-reference)
- [Testing](#testing)
- [Going to production](#going-to-production)
- [Roadmap](#roadmap)

---

## Quick start

Requirements: **Node.js ≥ 20**.

```bash
npm run setup     # install deps, generate Prisma client, create SQLite DB, seed demo data
npm run dev       # start the app on http://localhost:3000
```

Or step by step:

```bash
npm install
npx prisma generate
npx prisma db push          # creates prisma/dev.db
npm run db:seed             # demo data
npm run dev
```

Useful scripts:

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Unit + API integration tests (Vitest, against a separate SQLite test DB) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm run db:reset` | Drop + recreate the dev DB and reseed |
| `npm run db:seed` | (Re)seed demo data |

## Demo accounts

All seeded accounts use the password `password123`:

| Email | Role | Notes |
| --- | --- | --- |
| `admin@gigify.test` | Admin | Stats, commission settings, disputes, user moderation |
| `church@gigify.test` | Client | Grace Community Church — has a booking **awaiting escrow funding** |
| `events@gigify.test` | Client | Lumen Events — has a **completed** gig with reviews |
| `musician@gigify.test` | Musician | Maya Chen — pending applications + a completed paid gig |
| `james@gigify.test` | Musician | Jazz guitarist — $1,275 payout example |
| `sofia@gigify.test`, `daniel@gigify.test` | Musician | Extra directory profiles |

**Suggested tour:** sign in as `church@gigify.test` → Dashboard → open the youth-night booking → **Fund escrow**. Then sign in as `musician@gigify.test` → start the gig, sign back in as the church → **Confirm completion & pay**, and leave reviews on both sides. Check `admin@gigify.test` → Admin to see platform revenue and the commission setting.

---

## What's implemented

**Marketplace**
- Public gig feed with search + filters (type, genre, budget, date, "my gigs")
- Public musician directory with filters (instrument, genre, availability, search)
- Gig detail pages with application management for organizers
- Public musician profiles with ratings, review history, day rate and samples

**Accounts & roles**
- Three roles: `MUSICIAN`, `CLIENT` (church/venue/event), `ADMIN`
- Registration with role-specific profiles (instruments/genres/rate vs. organization)
- Cookie sessions (HttpOnly; only the SHA-256 of the token is stored server-side)
- Profile settings for both roles

**Booking lifecycle (state machine)**
```
OPEN gig → application ACCEPTED → booking PENDING_FUNDING
  → client funds escrow → FUNDED
  → musician starts → IN_PROGRESS
  → client confirms → COMPLETED (payout + platform fee issued)

PENDING_FUNDING → CANCELLED by either party (gig reopens)
FUNDED / IN_PROGRESS → DISPUTED → admin resolves → COMPLETED (paid) or REFUNDED
```

**Money**
- Escrow funding, musician payout and platform fee as immutable `Payment` rows with provider refs
- Commission rate **snapshotted onto each booking** — a later settings change never rewrites existing deals
- Admin-adjustable commission rate (0–50%)
- Payment provider abstraction with three implementations:
  - `mock` — instant, always-succeeding (local development & tests)
  - `stripe` — real escrow via Stripe test mode: PaymentIntents (fund), Transfers (payout), Refunds (disputes), idempotency keys, signed webhooks
  - `paystack` — real escrow via Paystack test mode: transaction initialize/verify, balance transfers, refunds, HMAC-SHA512-signed webhooks
- Two-step funding for real providers: `POST /bookings/:id/fund` returns a `clientAction` (card entry happens client-side), a second call with `providerRef` confirms the charge with the provider
- Webhook endpoints (`/api/v1/webhooks/stripe|paystack`) settle bookings idempotently with signature + amount verification

**Trust & moderation**
- Mutual post-gig reviews (one per party per booking, only after completion)
- In-app notifications for every meaningful event (applications, funding, completion, disputes…) — each one also sends a branded **transactional email** (JSONL outbox locally, Resend when `EMAIL_PROVIDER=resend`)
- Admin console: revenue stats, booking breakdown, dispute resolution, user suspension/role changes (suspending kills live sessions)

---

## How the money works

All amounts are **integer cents** — no floating point money.

```ts
// src/server/domain/commission.ts (pure, unit-tested)
platformFeeCents    = round(totalCents * rate)
musicianPayoutCents = totalCents - platformFeeCents   // absorbs rounding remainder
```

Example at the default **15%**:

| | Amount |
| --- | --- |
| Client funds escrow | $1,000.00 |
| Platform commission (15%) | − $150.00 |
| Musician payout | $850.00 |

The rate stored on a booking (`platformFeeRate`) is the source of truth for that booking's split; changing the global setting only affects **future** bookings.

---

## Architecture

```
Browser (React client components)
   │  fetch /api/v1/*  (JSON + HttpOnly session cookie)
   ▼
Next.js App Router route handlers        src/app/api/v1/**/route.ts
   │  validation (Zod) · auth guards · uniform error envelope
   ▼
Services (business logic + transactions) src/server/services/**
   │
   ├── Domain: commission math           src/server/domain/commission.ts
   ├── Payments: provider abstraction    src/server/payments/provider.ts
   └── Prisma Client → SQLite (dev) / PostgreSQL (prod)
```

Key decisions:

- **Route handlers are thin**; all rules (who can do what, state transitions, money) live in services, which are exercised directly by the integration tests.
- **Request validation** is Zod-based and centralized (`src/server/validation/schemas.ts`); errors return `{ error, details }` with the right HTTP status.
- **Money is integer cents** everywhere, and every payout/fee/refund is an immutable `Payment` row → full audit trail.
- **SQLite for zero-config dev**; the Prisma schema uses strings + TS unions instead of enums so switching the datasource to PostgreSQL needs no code changes.
- **Sessions over JWTs** so admin suspension invalidates access immediately.

## Project structure

```
prisma/
  schema.prisma           # User, Session, Gig, Application, Booking, Payment, Review, …
  seed.ts                 # demo accounts, gigs, a completed booking, a pending escrow
src/
  app/                    # pages (App Router) + api/v1 route handlers
    api/v1/…              # auth, gigs, applications, bookings, musicians, admin, …
  components/             # Nav, GigCard, GigForm, ui primitives, route guard
  lib/                    # client: api-client, auth-context, types, constants, format
  server/
    auth/                 # password hashing, cookie sessions, guards
    domain/               # commission math (pure)
    payments/             # PaymentProvider interface + mock/stripe-stub
    services/             # business logic (auth, gigs, applications, bookings, admin…)
    validation/           # Zod schemas
    db.ts, errors.ts, http.ts
tests/                    # Vitest: unit + full API flow integration tests
```

## API reference

Base path: `/api/v1`. All mutating endpoints require a session cookie unless noted.

| Method & path | Access | Purpose |
| --- | --- | --- |
| `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` | public / session | Auth |
| `GET /gigs` · `GET /gigs/:id` | public | Browse gig marketplace (filters: `search`, `gigType`, `genre`, `minBudgetCents`, `maxBudgetCents`, `dateFrom`, `dateTo`, `mine`, `page`, `limit`) |
| `POST /gigs` · `PATCH /gigs/:id` | client/admin | Create & manage gigs (incl. cancel) |
| `GET /gigs/:id/applications` | organizer/admin | Review applications |
| `POST /gigs/:id/applications` | musician | Apply to a gig |
| `GET /applications` | musician | My applications |
| `PATCH /applications/:id` | organizer/musician | `ACCEPT` / `REJECT` / `WITHDRAW` (accept creates the booking) |
| `GET /bookings` · `GET /bookings/:id` | party/admin | Booking lists & detail (escrow, payments, reviews) |
| `POST /bookings/:id/fund` | client | Fund escrow. Body optional: `{ providerRef }` confirms a pending real-provider charge (stripe/paystack) |
| `POST /bookings/:id/action` | party | `START` / `COMPLETE` / `CANCEL` / `DISPUTE` |
| `POST /bookings/:id/reviews` | party | Review after completion |
| `POST /webhooks/stripe` · `POST /webhooks/paystack` | signature | Payment provider webhooks (HMAC-verified, idempotent escrow settlement) |
| `GET /musicians` · `GET /musicians/:id` | public | Directory & profiles |
| `PATCH /profile` · `GET /profile` | session | Own profile |
| `GET /notifications` · `PATCH /notifications` | session | In-app notifications |
| `GET /admin/stats` · `GET/PATCH /admin/settings` | admin | Platform metrics & commission |
| `GET /admin/users` · `PATCH /admin/users/:id` | admin | Moderation (suspend/activate, roles) |
| `POST /admin/bookings/:id/resolve` | admin | Resolve disputes (`MUSICIAN_PAYOUT` / `CLIENT_REFUND`) |

## Testing

```bash
npm test
```

- `tests/commission.test.ts` — unit tests for the split math (rounding, invariants, bounds)
- `tests/api-auth.test.ts` — registration/login/logout, role guards, validation
- `tests/api-flow.test.ts` — full integration: gig → application → booking → escrow → completion → payouts → reviews, plus commission-rate snapshots, cancellation, disputes and admin revenue stats
- `tests/payments.test.ts` — Stripe/Paystack provider behavior with fully mocked HTTP, webhook signature verification + idempotent settlement, and the two-step funding contract
- `tests/email.test.ts` — template escaping, notification → outbox dispatch, Resend payload shape, failure isolation

Tests call the **real route handlers** with `NextRequest`s against a dedicated SQLite test database (`prisma/test.db`, reset per run) — no network, no mocks of our own code. The payment provider is the `mock` implementation unless a test injects one.

## Going to production

1. **Database** — set `DATABASE_URL` to PostgreSQL and run `npx prisma db push` (or migrations). No application code changes required.
2. **Payments** — `StripePaymentProvider` and `PaystackPaymentProvider` are implemented (test mode). To go live: add the secret keys + webhook secrets, complete Stripe Connect / Paystack recipient onboarding per musician (fields exist on `User`), and switch `PAYMENT_PROVIDER`.
3. **Sessions** — set `NODE_ENV=production` so cookies are `Secure`.
4. **Email** — implemented: set `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` (pluggable `EmailSender` in `src/server/email/sender.ts`; swap in SMTP/Postmark by adding another sender).
5. **Hardening** — add rate limiting on `/auth/*` and `/bookings/:id/fund`, background job to expire unpaid bookings, and legal pages (terms, payout/KYC for musicians above marketplace thresholds).

### Hosting on Firebase App Hosting

The app deploys to [Firebase App Hosting](https://firebase.google.com/docs/app-hosting) (SSR + API routes; requires the Blaze pay-as-you-go plan):

```bash
firebase apphosting:backends:create --non-interactive \
  --backend gigify-web --primary-region us-central1 --runtime nodejs22 --root-dir .
firebase deploy --only apphosting
```

Configuration lives in `apphosting.yaml`. On boot, `src/server/db.ts` runs the Prisma schema push and loads `prisma/seed.sql` (an idempotent demo-data snapshot) when `DB_BOOTSTRAP=1`, because the hosted SQLite file (`/tmp/gigify.db`) is **ephemeral** — it resets on every deploy and scale-to-zero restart. For durable data, set `DATABASE_URL` to a managed Postgres instance (Cloud SQL, Neon), point `DB_BOOTSTRAP`'s seed step at it (or disable it), and run `npx prisma db push` once.

## Roadmap

- [x] Stripe escrow (test mode): PaymentIntents, Transfers, Refunds, signed webhooks
- [x] Paystack escrow (test mode): initialize/verify, transfers, refunds, signed webhooks
- [ ] Card-entry UI (Stripe Elements / Paystack Inline) — activates when test keys are added
- [ ] Payout onboarding: Stripe Connect account links / Paystack recipient collection in the app
- [ ] Contracts: generated gig agreement both parties sign in-app
- [ ] Availability calendars + instant booking for pre-agreed rates
- [ ] Saved/favorite musicians & recurring gigs for churches
- [x] Transactional email for every event (console outbox in dev; Resend-ready)
- [ ] Weekly digest emails for musicians
- [ ] Payout accounts & tax forms (1099 generation) for musicians
- [ ] Multi-currency support
- [ ] Dispute evidence upload (photos, messages, set lists)
- [ ] Analytics for organizers (application conversion, no-show rates)

---

MIT licensed. Built with Next.js 14 (App Router), Prisma, TypeScript, Tailwind CSS, Zod and Vitest.
