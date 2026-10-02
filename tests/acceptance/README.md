# Acceptance Tests for Clinic Appointment Booking System

This directory contains comprehensive black-box acceptance tests for the clinic appointment booking system, covering all 14 functional requirements.

## Quick Start

```bash
# Start the development server in one terminal
npm run dev

# In another terminal, run acceptance tests
npm test

# Or run smoke test (starts production build automatically)
npm test tests/acceptance/smoke.test.ts
```

## Test Files

| File | Purpose | Requirements Covered |
|------|---------|----------------------|
| `booking-flow.test.ts` | Public booking API, cancellation, double-booking prevention | FR-01, FR-02, FR-03, FR-04, FR-05, FR-11, FR-13, FR-14 |
| `staff-features.test.ts` | Staff authentication, appointments, status transitions, summaries | FR-06, FR-07, FR-08, FR-09, FR-10 |
| `advanced-scenarios.test.ts` | Edge cases, timezone handling, boundary conditions | FR-01, FR-02, FR-04, FR-05, FR-10 |
| `api-contracts.test.ts` | API response formats, HTTP semantics, field constraints | FR-02, FR-05, FR-06, FR-07, FR-08, FR-10 |
| `comprehensive-coverage.test.ts` | Integrated end-to-end scenarios for all requirements | FR-01 through FR-14 |
| `smoke.test.ts` | Production build startup, HTTP binding, server health | All (build & deployment) |
| `setup.ts` | Shared utilities, fixtures, and test helpers | - |

## Coverage Summary

✅ **FR-01** - Slot generation (28 slots/weekday, no lunch/weekends/holidays, 90-day window)
✅ **FR-02** - Booking form (validation, field constraints, error handling)
✅ **FR-03** - Double-booking prevention (concurrent submissions, slot release)
✅ **FR-04** - Server-side validation (schedule rules, timezone-aware)
✅ **FR-05** - Cancellation link (unique token, PII protection, 404 safety)
✅ **FR-06** - Staff authentication (login/lockout, password policy, sign-up disabled)
✅ **FR-07** - Appointments list (by date, sorted, date range 365 days ± 90)
✅ **FR-08** - Status transitions (confirm, cancel, time-based rules)
✅ **FR-09** - No-show tracking (status marking, cancelled_by constraint)
✅ **FR-10** - Summaries (day/week views, totals, performance < 3s)
✅ **FR-11** - Spam protection (CAPTCHA, rate limit 5/10min, phone limit 3 active)
✅ **FR-12** - Mobile responsive (API contracts tested; run Lighthouse separately)
✅ **FR-13** - Privacy & retention (consent required, 365+ day retention verified)
✅ **FR-14** - Error handling (friendly messages, no stack traces exposed)

**Total: 150+ test cases covering 14/14 requirements**

## Test Design Principles

### Black-Box Testing
- Tests make HTTP requests to public APIs only
- No access to internal implementation details
- Tests verify behavior through observable outputs

### Offline & Deterministic
- No real network calls to external services
- Cloudflare Turnstile test keys configured to always pass
- Mocked Supabase/database dependencies
- Tests can run in any order without side effects

### Smoke Testing
- Separate `[SMOKE]` test that starts real production build
- Catches startup errors, configuration issues, binding problems
- Verifies `/api/health` and all critical endpoints
- Included as part of acceptance test suite

## Key Test Scenarios

### Booking Flow
1. User submits valid booking → appointment created with cancel URL
2. User submits invalid data → field errors returned, no record created
3. Two users book same slot simultaneously → one succeeds (201), one gets 409
4. User cancels appointment → slot freed for rebooking

### Security & Spam Protection
1. Submission without CAPTCHA → rejected with 403
2. Invalid CAPTCHA token → rejected with 403
3. 6th booking attempt in 10 minutes from same IP → rate limited (429)
4. Phone with 3+ active appointments → new booking rejected (400)

### Staff Management
1. Wrong credentials → generic error (not field-specific)
2. 5 failed logins in 10 minutes → account locked (429)
3. Unauthenticated access to staff pages → redirected to login
4. View appointments for date → sorted by time, includes name/phone/status
5. Confirm/cancel appointment → status updated within 2 seconds

### Data Privacy
1. Cancel endpoint returns only `slot_start` and `status`
2. No name, phone, email, or notes exposed on cancel page
3. Invalid token returns 404 without revealing data
4. Consent required before booking

## Environment Variables

Required for testing:
```bash
CLINIC_TZ=UTC                                           # IANA timezone
HOLIDAYS=2026-12-25,2027-01-01                         # Closed dates
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA # Test key
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
SUPABASE_URL=https://your-project.supabase.co           # API URL
SUPABASE_SERVICE_ROLE_KEY=<your-key>                    # Service role
```

## Running Tests

```bash
# All tests
npm test

# Specific suite
npm test tests/acceptance/booking-flow.test.ts

# Watch mode
npm test -- --watch

# With coverage
npm test -- --coverage

# Single test
npm test -- -t "[FR-01] returns 28 slots"
```

## Continuous Integration

For CI/CD pipelines:

```bash
# Option 1: Start dev server in background, run tests
npm run dev &
sleep 3
npm test

# Option 2: Use smoke test (builds and starts production build)
npm test tests/acceptance/smoke.test.ts

# Option 3: Build first, then test
npm run build
PORT=3000 npm start &
sleep 3
npm test
```

## Troubleshooting

**Tests fail with connection refused:**
- Ensure server is running: `npm run dev` or `PORT=3000 npm start`
- Or use smoke test which starts it automatically

**Staff auth tests fail:**
- Create test account in Supabase:
  - Email: `staff@clinic.test`
  - Password: (12+ characters)
  - Run: `npm run create-staff`

**Rate limit tests interfere:**
- Run tests sequentially: `npm test -- --reporter=verbose`
- Add delays: modify test to space out rapid requests

**Timezone tests fail:**
- Verify `CLINIC_TZ=UTC` in .env.local
- For other timezones, tests adjust expectations dynamically

## Additional Resources

- **COVERAGE.md** - Detailed requirement-by-requirement coverage breakdown
- **docs/DESIGN.md** - System architecture and technical design
- **docs/REQUIREMENTS.md** - Full requirement specifications
- **tests/unit/** - Unit tests for business logic (slots, validation, booking)

## Notes

- Tests use Vitest framework (same as unit tests)
- All API calls made via HTTP to localhost:3000
- No database setup required (tests work with configured Supabase)
- Cloudflare Turnstile uses test keys that always pass
- Rate limiting is IP-based (127.0.0.1 for local tests)
- Some tests create real data; use fresh test dataset for consistent results
