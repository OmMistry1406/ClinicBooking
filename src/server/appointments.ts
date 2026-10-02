import { allowedActions, isStaffAction } from '@/lib/appointmentActions';
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

export type TransitionResult =
  | { ok: true; appointment: StaffAppointment }
  | { ok: false; status: 400 | 401 | 404 | 409 | 503; error: string };

export interface TransitionDeps {
  token: string | undefined;
  isAuthenticated: (token: string) => Promise<boolean>;
  now: Date;
  fetchImpl?: typeof fetch;
  supabaseUrl?: string;
  anonKey?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = 'id,slot_start,name,phone,email,notes,status';

/**
 * Staff status change (confirm / cancel / no_show). Runs with the staff JWT so RLS applies.
 * The UPDATE is conditional on the status we validated (compare-and-set), so concurrent
 * changes cannot be overwritten. updated_at is set explicitly (and by the DB trigger);
 * cancelled_by is 'staff' only for cancel.
 */
export async function transitionAppointment(
  id: unknown,
  action: unknown,
  deps: TransitionDeps,
): Promise<TransitionResult> {
  if (!deps.token) return { ok: false, status: 401, error: 'Unauthorized' };
  try {
    if (!(await deps.isAuthenticated(deps.token))) return { ok: false, status: 401, error: 'Unauthorized' };
  } catch {
    return { ok: false, status: 503, error: 'Service unavailable' };
  }
  if (typeof id !== 'string' || !UUID_RE.test(id)) return { ok: false, status: 400, error: 'Invalid id' };
  if (!isStaffAction(action)) return { ok: false, status: 400, error: 'Invalid action' };

  const url = deps.supabaseUrl ?? process.env.SUPABASE_URL;
  const key = deps.anonKey ?? (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) return { ok: false, status: 503, error: 'Service unavailable' };
  const f = deps.fetchImpl ?? fetch;
  const headers = { apikey: key, Authorization: `Bearer ${deps.token}`, 'Content-Type': 'application/json' };
  const unauth = (s: number) => s === 401 || s === 403;

  try {
    const getRes = await f(`${url}/rest/v1/appointments?select=${COLUMNS}&id=eq.${id}`, {
      headers,
      cache: 'no-store',
    });
    if (unauth(getRes.status)) return { ok: false, status: 401, error: 'Unauthorized' };
    if (!getRes.ok) return { ok: false, status: 503, error: 'Service unavailable' };
    const rows = (await getRes.json()) as StaffAppointment[];
    const current = rows[0];
    if (!current) return { ok: false, status: 404, error: 'Appointment not found' };

    if (!allowedActions(current.status, current.slot_start, deps.now).includes(action)) {
      return { ok: false, status: 409, error: 'Action not allowed for this appointment' };
    }

    const nowIso = deps.now.toISOString();
    const patch =
      action === 'confirm'
        ? { status: 'confirmed', updated_at: nowIso }
        : action === 'cancel'
          ? { status: 'cancelled', cancelled_by: 'staff', updated_at: nowIso }
          : { status: 'no_show', updated_at: nowIso };

    const patchRes = await f(
      `${url}/rest/v1/appointments?id=eq.${id}&status=eq.${current.status}&select=${COLUMNS}`,
      { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(patch) },
    );
    if (unauth(patchRes.status)) return { ok: false, status: 401, error: 'Unauthorized' };
    if (!patchRes.ok) return { ok: false, status: 503, error: 'Service unavailable' };
    const updated = (await patchRes.json()) as StaffAppointment[];
    if (!updated[0]) return { ok: false, status: 409, error: 'Appointment was changed by someone else' };
    return { ok: true, appointment: updated[0] };
  } catch {
    return { ok: false, status: 503, error: 'Service unavailable' };
  }
}

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
  // Input validation first: it reveals nothing about the data, and malformed requests are 400 for everyone.
  if (typeof date !== 'string' || !isValidDateString(date)) {
    return { ok: false, status: 400, error: 'Invalid date' };
  }
  const { min, max } = allowedDateRange(deps.now, deps.tz);
  if (date < min || date > max) return { ok: false, status: 400, error: 'Date out of range' };

  if (!deps.token) return { ok: false, status: 401, error: 'Unauthorized' };
  try {
    if (!(await deps.isAuthenticated(deps.token))) return { ok: false, status: 401, error: 'Unauthorized' };
  } catch {
    return { ok: false, status: 503, error: 'Service unavailable' };
  }

  const url = deps.supabaseUrl ?? process.env.SUPABASE_URL;
  const key = deps.anonKey ?? (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) return { ok: false, status: 503, error: 'Service unavailable' };

  return queryRange(date, date, deps, url, key);
}

export type SummaryView = 'day' | 'week';

export interface Summary {
  view: SummaryView;
  from: string;
  to: string;
  total: number;
  pending: number;
  confirmed: number;
  cancelled: number;
  no_show: number;
  list: StaffAppointment[];
}

export type SummaryResult =
  | { ok: true; summary: Summary }
  | { ok: false; status: 400 | 401 | 503; error: string };

/** Monday..Sunday week (clinic local dates) containing `date`. */
export function weekBounds(date: string): { from: string; to: string } {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const fromMonday = (dow + 6) % 7;
  const from = addDays(date, -fromMonday);
  return { from, to: addDays(from, 6) };
}

/** Day or Mon-Sun week summary: total, count per status, and the sorted list. */
export async function summarizeAppointments(view: unknown, date: unknown, deps: ListDeps): Promise<SummaryResult> {
  if (view !== 'day' && view !== 'week') return { ok: false, status: 400, error: 'Invalid view' };
  if (typeof date !== 'string' || !isValidDateString(date)) {
    return { ok: false, status: 400, error: 'Invalid date' };
  }
  const { min, max } = allowedDateRange(deps.now, deps.tz);
  if (date < min || date > max) return { ok: false, status: 400, error: 'Date out of range' };

  if (!deps.token) return { ok: false, status: 401, error: 'Unauthorized' };
  try {
    if (!(await deps.isAuthenticated(deps.token))) return { ok: false, status: 401, error: 'Unauthorized' };
  } catch {
    return { ok: false, status: 503, error: 'Service unavailable' };
  }
  const url = deps.supabaseUrl ?? process.env.SUPABASE_URL;
  const key = deps.anonKey ?? (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) return { ok: false, status: 503, error: 'Service unavailable' };

  const { from, to } = view === 'day' ? { from: date, to: date } : weekBounds(date);
  const res = await queryRange(from, to, deps, url, key);
  if (!res.ok) return res;
  const counts = { pending: 0, confirmed: 0, cancelled: 0, no_show: 0 };
  for (const a of res.appointments) counts[a.status] += 1;
  return { ok: true, summary: { view, from, to, total: res.appointments.length, ...counts, list: res.appointments } };
}

async function queryRange(
  fromDate: string,
  toDate: string,
  deps: ListDeps,
  url: string,
  key: string,
): Promise<ListResult> {
  const start = dayBoundsUtc(fromDate, deps.tz).start;
  const end = dayBoundsUtc(toDate, deps.tz).end;
  const date = fromDate;
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
