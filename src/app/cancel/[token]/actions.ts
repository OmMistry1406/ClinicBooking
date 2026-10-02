'use server';

import { cancelAppointmentByToken, findActiveSlotByToken } from '@/lib/supabase/admin';
import { cancelByToken } from '@/server/cancel';

export interface CancelState {
  status: 'idle' | 'cancelled' | 'not_found';
}

export async function cancelAppointmentAction(
  _prev: CancelState,
  formData: FormData,
): Promise<CancelState> {
  const token = formData.get('token');
  const result = await cancelByToken(token, {
    findActiveSlot: (t) => findActiveSlotByToken(t),
    cancel: (t, nowIso) => cancelAppointmentByToken(t, nowIso),
  });
  return { status: result.ok ? 'cancelled' : 'not_found' };
}
