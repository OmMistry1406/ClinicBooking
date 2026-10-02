import { cookies } from 'next/headers';
import { loadConfig } from '@/lib/config';
import { ACCESS_COOKIE } from '@/lib/session';
import { getUser } from '@/lib/supabase/gotrue';
import { listAppointmentsForDate, type ListResult } from './appointments';

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
