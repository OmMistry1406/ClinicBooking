import { cookies } from 'next/headers';
import { loadConfig } from '@/lib/config';
import { ACCESS_COOKIE } from '@/lib/session';
import { getUser } from '@/lib/supabase/gotrue';
import {
  listAppointmentsForDate,
  summarizeAppointments,
  type SummaryResult,
  transitionAppointment,
  type ListResult,
  type TransitionResult,
} from './appointments';

/** Authenticates from the session cookie, then applies confirm / cancel / no_show. */
export async function changeStaffAppointment(id: unknown, action: unknown): Promise<TransitionResult> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  return transitionAppointment(id, action, {
    token,
    isAuthenticated: async (t) => (await getUser(t)) !== null,
    now: new Date(),
  });
}

/** Day / week summary (FR-10), authenticated from the session cookie. */
export async function fetchStaffSummary(view: unknown, date: unknown): Promise<SummaryResult> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  return summarizeAppointments(view, date, {
    token,
    isAuthenticated: async (t) => (await getUser(t)) !== null,
    now: new Date(),
    tz: loadConfig().clinicTz,
  });
}

/** Shared by the server action and the GET route: authenticates from the session cookie, then lists. */
export async function fetchStaffAppointments(date: unknown): Promise<ListResult> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  return listAppointmentsForDate(date, {
    token,
    isAuthenticated: async (t) => (await getUser(t)) !== null,
    now: new Date(),
    tz: loadConfig().clinicTz,
  });
}
