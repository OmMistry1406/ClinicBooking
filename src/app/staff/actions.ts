'use server';

import type { ListResult, TransitionResult } from '@/server/appointments';
import { changeStaffAppointment, fetchStaffAppointments } from '@/server/staffAppointmentsApi';

/** Server action: appointments for a clinic-local date (YYYY-MM-DD). Rejects unauthenticated callers. */
export async function fetchAppointmentsAction(date: string): Promise<ListResult> {
  return fetchStaffAppointments(date);
}

/** Server action: confirm / cancel (staff) / no_show. Rejects unauthenticated callers with 401. */
export async function changeStatusAction(id: string, action: string): Promise<TransitionResult> {
  return changeStaffAppointment(id, action);
}
