import { NextResponse } from 'next/server';
import {
  cancelAppointmentByToken,
  findActiveSlotByToken,
  findAppointmentStateByToken,
} from '@/lib/supabase/admin';
import { cancelByToken, isPlausibleToken, NOT_FOUND_MESSAGE } from '@/server/cancel';

export const dynamic = 'force-dynamic';

const deps = {
  findActiveSlot: (t: string) => findActiveSlotByToken(t),
  cancel: (t: string, nowIso: string) => cancelAppointmentByToken(t, nowIso),
};

const notFound = () => NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isPlausibleToken(token)) return notFound();
  try {
    const state = await findAppointmentStateByToken(token);
    if (!state) return notFound();
    return NextResponse.json({ slot_start: state.slot_start, status: state.status });
  } catch {
    return notFound();
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await cancelByToken(token, deps);
  if (!res.ok) return notFound();
  return NextResponse.json({ status: 'cancelled' });
}
