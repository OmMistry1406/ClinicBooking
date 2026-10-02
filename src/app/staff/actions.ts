'use server';

import type { ListResult } from '@/server/appointments';
import { fetchStaffAppointments } from '@/server/staffAppointmentsApi';

/** Server action: appointments for a clinic-local date (YYYY-MM-DD). Rejects unauthenticated callers. */
export async function fetchAppointmentsAction(date: string): Promise<ListResult> {
  return fetchStaffAppointments(date);
}
