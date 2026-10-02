import { cookies } from 'next/headers';
import { loadConfig } from '@/lib/config';
import { ACCESS_COOKIE } from '@/lib/session';
import { getUser } from '@/lib/supabase/gotrue';
import {
  listAppointmentsForDate,
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
