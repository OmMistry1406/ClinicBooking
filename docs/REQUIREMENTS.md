## FR-01 Slot generation from fixed schedule (must)
The system MUST generate bookable 15-minute slots from fixed rules held in configuration: Monday–Friday 09:00–17:00 excluding 13:00–14:00, Saturday and Sunday closed, configured holiday dates closed, within the next 90 days, evaluated in the clinic time zone (env var CLINIC_TZ).

- [ ] A normal weekday offers 28 slots: 16 from 09:00–12:45 and 12 from 14:00–16:45 (last start 16:45)
- [ ] For every Saturday and Sunday in the 90-day window, zero slots are offered
- [ ] No slots are offered between 13:00 and 13:59, or on any date in the configured holiday list
- [ ] Dates later than today + 90 days offer zero slots
- [ ] For today, slots whose start time is not after the current clinic-local time are not offered

## FR-02 Patient booking form (must)
The system MUST provide a public page where a patient picks a date and an available slot and submits name, phone, optional email and optional notes.

- [ ] Submitting with name or phone empty is rejected with field-level errors and no record is created
- [ ] Email may be empty; if entered it must match /^[^\s@]+@[^\s@]+\.[^\s@]+$/ and be at most 254 chars; 'test@example.co.uk' is accepted and 'test@.com' and 'test@' are rejected
- [ ] Name max 100 chars, phone 7–20 chars (digits, +, spaces, dashes), notes max 500 chars; violations are rejected
- [ ] A valid submission creates an appointment with status 'pending' and the confirmation screen is shown within 3 seconds of server response on a 4G connection; if the response takes longer than 3 seconds a loading message 'Your appointment is being confirmed...' is displayed
- [ ] Slots already pending or confirmed are not selectable

## FR-03 Double-booking prevention (must)
The system MUST ensure a slot cannot hold more than one active appointment, enforced by a database partial unique index on slot start for pending/confirmed appointments.

- [ ] Two simultaneous submissions for the same slot result in exactly 1 stored appointment
- [ ] The losing submission shows 'slot no longer available' and the slot list refreshes
- [ ] A slot becomes bookable again after its appointment is cancelled

## FR-04 Server-side validation of schedule rules (must)
The system MUST re-validate on the server that the submitted slot is valid per FR-01, converting stored UTC times to the clinic time zone (env var CLINIC_TZ, an IANA name, set at deployment) before applying rules.

- [ ] A crafted request for a Saturday, Sunday, lunch hour, holiday, non-15-minute-aligned time, or date > 90 days ahead returns HTTP 400 and creates no record
- [ ] A crafted request for a past time returns HTTP 400
- [ ] With the server running in UTC and CLINIC_TZ set to a non-UTC zone, a slot at 09:00 clinic-local time is accepted and 09:00 UTC is rejected when it falls outside clinic hours locally
- [ ] If CLINIC_TZ is missing or invalid the app fails startup/health check rather than defaulting silently

## FR-05 Private cancellation link (must)
The system MUST give the patient, on the confirmation screen, a unique cancellation URL containing an unguessable token (at least 128 bits of randomness) letting them cancel their own appointment without an account.

- [ ] The confirmation screen displays the cancellation link after booking
- [ ] Opening the link shows appointment date/time and a Cancel button, and no name, phone, email or notes
- [ ] Cancelling sets status 'cancelled' with cancelled_by='patient' and frees the slot
- [ ] An invalid or unknown token shows a not-found message and reveals no appointment data
- [ ] The page offers no control to change date/time

## FR-06 Staff authentication (must)
The system MUST protect the staff page with Supabase Auth email + password login for a single account created by the developer.

- [ ] Unauthenticated access to the staff page shows only the login form and no appointment data
- [ ] Wrong credentials show one generic error that does not indicate which field was wrong
- [ ] After 5 failed attempts within 10 minutes further login attempts are blocked for 10 minutes
- [ ] Passwords must be at least 12 characters
- [ ] Logout ends the session and the staff page is inaccessible without logging in again
- [ ] No public sign-up route exists (a request to sign up returns 403/404)
- [ ] The developer creates the account in Supabase before handover with a temporary password; the staff user is required to set a new password of 12+ characters at first login, and can reset it later via a Supabase email link

## FR-07 Staff appointments list by date (must)
The system MUST show on the staff page the appointments for a selected date (default today in clinic time zone) sorted by time, each with patient name, phone, email (if given), time, status and notes.

- [ ] Default view lists only appointments dated today in clinic time zone, ordered ascending by time
- [ ] Each row shows name, phone, time, status, notes, and email only when provided
- [ ] Phone number is a tap-to-call tel: link
- [ ] Staff can select any date from 365 days in the past to today + 90 days; dates outside that range are not selectable
- [ ] An empty day shows a 'No appointments' message

## FR-08 Confirm or cancel appointments (must)
The system MUST let staff mark each appointment confirmed or cancelled.

- [ ] A pending appointment can be set to confirmed with one click and the row updates within 2 seconds
- [ ] Cancel is available for pending or confirmed appointments with a future start time and shows a dialog 'This will free the time slot and the patient will not be notified. Proceed?' with Cancel/Confirm buttons; confirming sets status 'cancelled' and cancelled_by='staff'
- [ ] Cancel is not offered for no_show or already cancelled appointments, nor for confirmed appointments whose time has passed
- [ ] Cancelling frees the slot for new bookings
- [ ] Each status change stores a timestamp (updated_at)
- [ ] An unauthenticated request to a status-change endpoint returns 401/403

## FR-09 No-show tracking (should)
The system SHOULD let staff mark a confirmed appointment as no-show once its start time has passed so no-shows appear in reports.

- [ ] The 'No-show' action appears only for confirmed appointments whose start time is in the past
- [ ] Marking sets status 'no_show' and it is counted separately in summaries
- [ ] The database column cancelled_by is constrained to the values 'patient', 'staff' or NULL; it is 'patient' when cancelled via the cancellation link, 'staff' when cancelled by staff, and NULL for all other statuses

## FR-10 Daily and weekly summaries (must)
The system MUST provide on the staff page a summary for a chosen day or week (Mon–Sun) showing total appointments, counts per status (pending, confirmed, cancelled, no_show) and a list of all appointments with patient name, time and status.

- [ ] Total equals the sum of the four status counts, and all statuses including cancelled and no_show are included in total and list
- [ ] The list shows every appointment in the period sorted by time, each with name, time and status label
- [ ] Counts per status match the records for a seeded test dataset of 20 appointments
- [ ] Dates selectable are the same range as FR-07
- [ ] Switching between day and week loads within 3 seconds for up to 500 appointments

## FR-11 Spam protection on public form (must)
The system MUST protect booking submission with CAPTCHA (Cloudflare Turnstile) and rate limiting; both checks apply independently.

- [ ] A submission without a valid CAPTCHA token is rejected with HTTP 400/403 and counts toward the IP rate limit
- [ ] A valid CAPTCHA token does not bypass rate limiting: the 6th submission from one IP within 10 minutes returns HTTP 429
- [ ] A phone number with 3 or more pending/confirmed appointments in the future is rejected with HTTP 400 and the message 'You have reached the maximum of 3 active appointments. Please cancel an existing appointment before booking another.' This applies to new submissions only, regardless of IP
- [ ] If the CAPTCHA service is unreachable the submission is rejected (fail closed) with the message 'Please check your connection and try again.'

## FR-12 Mobile responsive UI (must)
The system MUST render all 3 pages usably on phones and tablets.

- [ ] No horizontal scrolling at viewport widths of 320, 768 and 1024 px
- [ ] Interactive controls have a tap target of at least 44x44 px
- [ ] The booking flow can be completed end-to-end at a 375 px wide viewport
- [ ] Lighthouse (CLI, default settings) Accessibility category score is at least 80 on /book, /cancel/[token] and /staff

## FR-13 Privacy notice and data retention (must)
The system MUST show a privacy notice with a consent checkbox on the booking form and retain records for at least 365 days. Notice wording is supplied and approved by the client before launch.

- [ ] The form cannot be submitted unless the consent checkbox is ticked
- [ ] The notice lists the data collected (name, phone, email if given, notes, appointment time), states that only the clinic staff can see it, and names a clinic contact; wording approved in writing by the client before go-live
- [ ] No appointment records are automatically deleted before 365 days
- [ ] All traffic is served over HTTPS only (HTTP requests redirect to HTTPS)

## FR-14 Booking error handling (must)
The system MUST show patient-friendly messages for failures and never expose internal errors.

- [ ] If the database is unavailable the booking form shows 'Booking temporarily unavailable. Please try again in 5 minutes.' with HTTP 503 and no stack trace or internal text
- [ ] If the rate limiter store fails, submissions are rejected with the same 503 message
- [ ] Entered form values are preserved after any error