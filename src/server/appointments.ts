import { addDays, isValidDateString, localDate, zonedToUtc } from './slots';

export const PAST_DAYS = 365;
export const FUTURE_DAYS = 90;

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'no_show';

export interface StaffAppointment {
  id: string;
  slot_start: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  status: AppointmentStatus;
}

export type ListResult =
  | { ok: true; date: string; appointments: StaffAppointment[] }
  | { ok: false; status: 400 | 401 | 503; error: string };

/** Selectable range (inclusive, YYYY-MM-DD) in clinic local time. */
export function allowedDateRange(now: Date, tz: string): { min: string; max: string; today: string } {
  const today = localDate(now.getTime(), tz);
  return { today, min: addDays(today, -PAST_DAYS), max: addDays(today, FUTURE_DAYS) };
}

/** UTC bounds [start, end) of a clinic-local calendar day. */
export function dayBoundsUtc(date: string, tz: string): { start: string; end: string } {
  const at = (d: string) => (zonedToUtc(d, 0, tz) ?? zonedToUtc(d, 60, tz))!;
  return { start: at(date).toISOString(), end: at(addDays(date, 1)).toISOString() };
}

export interface ListDeps {
  /** Staff access token from the session cookie. */
  token: string | undefined;
  /** Validates the token with Supabase Auth; true when it belongs to a signed-in user. */
  isAuthenticated: (token: string) => Promise<boolean>;
  now: Date;
  tz: string;
  fetchImpl?: typeof fetch;
  supabaseUrl?: string;
  anonKey?: string;
}

/**
 * Lists appointments for a clinic-local date, ascending by slot_start.
 * The query runs with the staff user's JWT and the anon key so Postgres RLS applies.
 */
export async function listAppointmentsForDate(date: unknown, deps: ListDeps): Promise<ListResult> {
  if (!deps.token) return { ok: false, status: 401, error: 'Unauthorized' };
  try {
    if (!(await deps.isAuthenticated(deps.token))) return { ok: false, status: 401, error: 'Unauthorized' };
  } catch {
    return { ok: false, status: 503, error: 'Service unavailable' };
  }

  if (typeof date !== 'string' || !isValidDateString(date)) {
    return { ok: false, status: 400, error: 'Invalid date' };
  }
  const { min, max } = allowedDateRange(deps.now, deps.tz);
  if (date < min || date > max) return { ok: false, status: 400, error: 'Date out of range' };

  const url = deps.supabaseUrl ?? process.env.SUPABASE_URL;
  const key = deps.anonKey ?? (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) return { ok: false, status: 503, error: 'Service unavailable' };

  const { start, end } = dayBoundsUtc(date, deps.tz);
  const query =
    `select=id,slot_start,name,phone,email,notes,status` +
    `&slot_start=gte.${encodeURIComponent(start)}&slot_start=lt.${encodeURIComponent(end)}` +
    `&order=slot_start.asc`;
  try {
    const res = await (deps.fetchImpl ?? fetch)(`${url}/rest/v1/appointments?${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${deps.token}` },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) return { ok: false, status: 401, error: 'Unauthorized' };
    if (!res.ok) return { ok: false, status: 503, error: 'Service unavailable' };
    const rows = (await res.json()) as StaffAppointment[];
    // Defensive: guarantee ascending order regardless of the backend.
    rows.sort((a, b) => Date.parse(a.slot_start) - Date.parse(b.slot_start));
    return { ok: true, date, appointments: rows };
  } catch {
    return { ok: false, status: 503, error: 'Service unavailable' };
  }
}
