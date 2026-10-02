# Technical design

**Architecture:** Monolith: one Next.js App Router app. Pages in src/app call business logic in src/server (pure, testable services that take injected dependencies). src/lib holds infrastructure: env/config validation, Supabase clients, Turnstile and rate limiter. Public writes run only in server code with the service role key. Staff reads and updates use the authenticated user session so RLS applies. Slots are computed in code from configuration and only bookings are stored.

## Stack
- **Framework:** Next.js 15 (App Router) + TypeScript, single monolith — Matches SRS; native Vercel deploy; server actions and route handlers in one codebase.
- **Styling:** Tailwind CSS (mobile-first) — Required by SRS; zero runtime cost.
- **Database:** Supabase Postgres (free tier) via @supabase/supabase-js — Partial unique index for double-booking, RLS, free at minimum budget.
- **Auth:** Supabase Auth email+password via @supabase/ssr — Single staff account; cookie sessions; public sign-up disabled.
- **Validation:** Zod — Shared client/server schemas; NFR requires all inputs validated.
- **Time zone:** date-fns + @date-fns/tz — DST-safe conversion between clinic-local time and UTC.
- **CAPTCHA:** Cloudflare Turnstile, server-side siteverify via fetch — Free; fail closed when unreachable.
- **Rate limiting and login lockout:** Postgres-backed counters (rate_limits table, atomic SQL function) called with the service role — Vercel serverless instances do not share memory, so in-memory limits are ineffective. The existing DB gives durable limits at no extra cost. This replaces the plan's in-memory approach.
- **Testing:** Vitest with mocked Supabase client; pure-logic unit tests — Runs offline after npm ci; TypeScript native; fast.
- **Hosting:** Vercel Hobby (Pro if client approves) — Deploy target; HTTPS redirect is built in.

## Modules
- **config (src/lib/config.ts)** (FR-01, FR-04): Parse and validate env at startup: CLINIC_TZ (IANA, fail fast), HOLIDAYS, hours, lunch, slot length, window. Exposed via /api/health.
- **slots (src/server/slots.ts)** (FR-01, FR-04, FR-02): Generate slots per date in the clinic time zone, validate a slot start, and subtract booked slots.
- **booking service (src/server/booking.ts)** (FR-02, FR-03, FR-04, FR-05, FR-11, FR-14): Zod validation, schedule re-validation, active-appointment limit per phone, insert, mapping unique violation 23505 to a slot-taken error, generating cancel_token.
- **spam protection (src/lib/turnstile.ts, src/lib/ratelimit.ts)** (FR-11, FR-14, FR-06): Turnstile verification (fail closed), DB-backed IP rate limit (5 per 10 min), login lockout counter, 503 on limiter failure.
- **cancellation service (src/server/cancel.ts)** (FR-05, FR-03): Look up an appointment by token, returning only the time. Patient cancel sets cancelled_by='patient'.
- **staff auth (src/lib/supabase/*, src/server/auth.ts, middleware.ts)** (FR-06): Login with lockout, logout, forced first-login password change (12+ chars), session check, block sign-up routes.
- **staff appointments (src/server/appointments.ts)** (FR-07, FR-08, FR-09): List by date, status transitions (confirm, cancel, no-show) with time-based rules, date-range limits.
- **summaries (src/server/summaries.ts)** (FR-10): Day or week (Mon–Sun) counts per status, total and sorted list.
- **UI components (src/components)** (FR-02, FR-12, FR-13, FR-14): Booking form, slot picker, consent and privacy notice, cancel page, staff list and summary, confirm dialog. Mobile-first with 44px tap targets and accessibility.
- **database migrations (supabase/migrations)** (FR-03, FR-06, FR-08, FR-09, FR-10, FR-13): Schema, partial unique index, check constraints, RLS, rate_limits table and function.

## Data model
### appointments
- id uuid pk default gen_random_uuid()
- slot_start timestamptz not null
- name text not null (<=100)
- phone text not null (7-20)
- email text null (<=254)
- notes text null (<=500)
- status text not null default 'pending' check in ('pending','confirmed','cancelled','no_show')
- cancel_token text not null unique (32 random bytes, base64url)
- cancelled_by text null check in ('patient','staff')
- consent_at timestamptz not null
- created_at timestamptz default now()
- updated_at timestamptz default now() (trigger)
_Relations:_ Partial unique index on (slot_start) where status in ('pending','confirmed'); Check: cancelled_by is not null only when status='cancelled'; Index on slot_start for range queries; index on phone for the active limit; RLS enabled: authenticated role may select and update; no anon policies; public writes use the service role server-side only

### rate_limits
- key text pk (e.g. 'book:ip:1.2.3.4', 'login:email')
- window_start timestamptz
- count int
_Relations:_ No RLS policies for anon or authenticated; accessed only by the service role via the function hit_rate_limit(key, max, window_seconds)

## API
- `GET /api/slots?date=YYYY-MM-DD` — Available slots for a date, with a p95 target under 1s (FR-01, FR-02, FR-03)
- `POST /api/appointments` — Create a booking: Zod, Turnstile, rate limit, schedule validation, phone limit, insert. Returns 201 with cancel URL, or 400/409/429/503. (FR-02, FR-03, FR-04, FR-05, FR-11, FR-13, FR-14)
- `GET /api/cancel/[token]` — Return the appointment time and status only, or 404 (FR-05)
- `POST /api/cancel/[token]` — Patient cancellation (sets cancelled_by='patient') (FR-05, FR-03)
- `POST /api/staff/login` — Email/password login with lockout (5 failures in 10 min blocks for 10 min) and a generic error (FR-06)
- `POST /api/staff/logout` — End session (FR-06)
- `POST /api/staff/password` — Change password (min 12 chars), required at first login (FR-06)
- `GET /api/staff/appointments?date=YYYY-MM-DD` — Appointments for a date, sorted by time (auth required) (FR-07)
- `PATCH /api/staff/appointments/[id]` — Status change: confirm, cancel (staff) or no_show; 401 when unauthenticated (FR-08, FR-09)
- `GET /api/staff/summary?view=day|week&date=YYYY-MM-DD` — Totals, counts per status and list (FR-10)
- `GET /api/health` — Fail with 500 if CLINIC_TZ is missing or invalid; checks the DB (FR-04)
- `ANY /auth/signup (and Supabase signup)` — Return 404/403; also disable signups in Supabase settings (FR-06)

## Folder structure
```
src/app/page.tsx (redirects to /book)
src/app/book/page.tsx
src/app/cancel/[token]/page.tsx
src/app/staff/page.tsx (login or dashboard)
src/app/staff/change-password/page.tsx
src/app/api/slots/route.ts
src/app/api/appointments/route.ts
src/app/api/cancel/[token]/route.ts
src/app/api/staff/{login,logout,password,appointments,summary}/route.ts
src/app/api/health/route.ts
src/components/ (BookingForm, SlotPicker, StaffList, SummaryPanel, ConfirmDialog)
src/lib/config.ts
src/lib/supabase/{server,admin,browser}.ts
src/lib/turnstile.ts
src/lib/ratelimit.ts
src/lib/validation.ts (Zod schemas)
src/server/{slots,booking,cancel,appointments,summaries,auth}.ts
src/middleware.ts
supabase/migrations/0001_init.sql
tests/unit/ (slots, validation, booking, transitions, summaries)
tests/integration/ (API handlers with mocked Supabase)
docs/ (README, handover, privacy-notice template, acceptance test report)
.env.example
vitest.config.ts
tailwind.config.ts
package.json
```

## Commands
- install: `npm ci --no-audit --no-fund`
- build: `npm run build`
- test: `npx vitest run`
- dev: `npm run dev -- -H 0.0.0.0 -p ${PORT:-3000}`

## Decisions (ADRs)
1. **ADR-1: Next.js monolith on Vercel with Supabase** — One Next.js App Router app with route handlers and server actions. Supabase provides Postgres and Auth. No separate backend. _Consequences:_ Lowest cost and simplest deploy. Business logic stays in src/server so it is testable without Next.js.
2. **ADR-2: Double-booking enforced by DB partial unique index** — Unique index on slot_start where status in ('pending','confirmed'). The app inserts and maps error 23505 to a 409 'slot no longer available'. It never does check-then-insert. _Consequences:_ The race is closed at the database. Cancelling frees the slot automatically. The client must refresh the slot list on 409.
3. **ADR-3: Slots computed, not stored** — Slots are generated in code from config in CLINIC_TZ. Only bookings are stored, in UTC. The same validator runs on slot listing and booking. _Consequences:_ No seeding or migration for schedule changes. Changing hours or holidays needs a redeploy. DST needs unit tests with at least two zones.
4. **ADR-4: Database-backed rate limiting instead of in-memory** — Rate limits and login lockout use a Postgres table and an atomic upsert function, called with the service role. If the store fails, the request is rejected with 503. This supersedes the plan's in-memory risk acceptance. _Consequences:_ Limits hold across serverless instances with no new vendor. Adds one small DB write per submission. The login lockout is custom because Supabase Auth has only its own built-in limits.
5. **ADR-5: RLS plus service role split** — Staff operations use the user session client, so RLS permits authenticated users only. Public booking and cancellation use the service role in server-only modules (import 'server-only'). Cancellation lookup selects only slot_start and status. _Consequences:_ The service role key never reaches the browser. Public cancel endpoints must be written carefully to avoid leaking PII, and a test asserts the response shape.
6. **ADR-6: Startup config validation and first-login password change** — The config module parses env with Zod and fails on invalid CLINIC_TZ (checked via Intl.DateTimeFormat). The developer sets must_change_password in the user's app_metadata. Middleware redirects to /staff/change-password until it is cleared. Supabase signups are disabled and a signup route returns 404. _Consequences:_ Misconfiguration is caught at build or health check, not silently. Password minimum length of 12 is also set in the Supabase Auth settings.
7. **ADR-7: Offline tests** — Tests use Vitest with mocked Supabase and Turnstile clients and no network. Concurrency is verified by a real-DB test run manually in T-14 against a local or staging Supabase. _Consequences:_ CI-style npm test passes offline. The true race test is a documented manual step.