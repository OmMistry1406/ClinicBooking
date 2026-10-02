import type { BookingFormErrors, BookingFormValues } from './validation';

export const SLOW_MESSAGE = 'Your appointment is being confirmed...';
export const SLOW_AFTER_MS = 3000;
const UNAVAILABLE = 'Booking temporarily unavailable. Please try again in 5 minutes.';

export type SubmitOutcome =
  | { kind: 'success'; cancelToken: string }
  | { kind: 'slot_taken'; message: string }
  | { kind: 'error'; status: number; message: string; fieldErrors: BookingFormErrors };

const FIELD_KEYS = ['date', 'slot', 'name', 'phone', 'email', 'notes', 'consent'] as const;

/**
 * Posts the booking. Calls onSlow() if the server has not responded after 3 seconds.
 * Never throws; network failures are reported as a user-friendly error.
 */
export async function submitBooking(
  values: BookingFormValues,
  captchaToken: string,
  opts: { fetchImpl?: typeof fetch; onSlow?: () => void } = {},
): Promise<SubmitOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timer = setTimeout(() => opts.onSlow?.(), SLOW_AFTER_MS);
  try {
    const res = await fetchImpl('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slot: values.slot,
        name: values.name,
        phone: values.phone,
        email: values.email,
        notes: values.notes,
        consent: values.consent,
        captchaToken,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      cancelToken?: string;
      error?: string;
      fieldErrors?: Record<string, string>;
    };
    if (res.status === 201 && body.cancelToken) {
      return { kind: 'success', cancelToken: body.cancelToken };
    }
    if (res.status === 409) {
      return {
        kind: 'slot_taken',
        message: body.error ?? 'This slot is no longer available. Please choose another.',
      };
    }
    const fieldErrors: BookingFormErrors = {};
    for (const k of FIELD_KEYS) {
      const m = body.fieldErrors?.[k];
      if (m) fieldErrors[k] = m;
    }
    let message = body.error;
    if (!message && Object.keys(fieldErrors).length > 0) message = 'Please correct the highlighted fields.';
    if (res.status === 503 || !message) message = res.status === 503 ? UNAVAILABLE : 'Something went wrong. Please try again.';
    if (res.status === 403) message = body.error ?? 'CAPTCHA verification failed. Please try again.';
    return { kind: 'error', status: res.status, message, fieldErrors };
  } catch {
    return { kind: 'error', status: 503, message: UNAVAILABLE, fieldErrors: {} };
  } finally {
    clearTimeout(timer);
  }
}
