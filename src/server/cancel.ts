/** Cancellation service (FR-05). Exposes only the appointment time; never any PII. */

export const NOT_FOUND_MESSAGE = 'Appointment not found or already cancelled.';
export const CANCELLED_MESSAGE =
  'Your appointment has been cancelled. You can book a new appointment using the button below.';

/** base64url of 32 random bytes is 43 chars; accept a sane range, anything else is "not found". */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

export interface CancelDeps {
  /** Returns slot_start (ISO) of a non-cancelled appointment with this token, else null. */
  findActiveSlot: (token: string) => Promise<string | null>;
  /** Atomically cancels a non-cancelled appointment; returns true if a row was updated. */
  cancel: (token: string, nowIso: string) => Promise<boolean>;
  now?: () => Date;
}

export type LookupResult = { found: true; slotStart: string } | { found: false };
export type CancelResult = { ok: true } | { ok: false };

export function isPlausibleToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

export async function lookupAppointment(token: unknown, deps: CancelDeps): Promise<LookupResult> {
  if (!isPlausibleToken(token)) return { found: false };
  try {
    const slotStart = await deps.findActiveSlot(token);
    return slotStart ? { found: true, slotStart } : { found: false };
  } catch {
    return { found: false };
  }
}

export async function cancelByToken(token: unknown, deps: CancelDeps): Promise<CancelResult> {
  if (!isPlausibleToken(token)) return { ok: false };
  try {
    const now = (deps.now ?? (() => new Date()))();
    return (await deps.cancel(token, now.toISOString())) ? { ok: true } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/** Formats an instant in the clinic time zone, e.g. "Monday, 5 October 2026" and "09:30". */
export function formatSlot(slotStartIso: string, tz: string): { date: string; time: string } {
  const d = new Date(slotStartIso);
  return {
    date: new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d),
    time: new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d),
  };
}
