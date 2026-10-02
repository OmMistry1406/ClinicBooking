import { NextResponse } from 'next/server';
import { cancelAppointmentByToken, findActiveSlotByToken } from '@/lib/supabase/admin';
import { cancelByToken, lookupAppointment, NOT_FOUND_MESSAGE } from '@/server/cancel';

export const dynamic = 'force-dynamic';

const deps = {
  findActiveSlot: (t: string) => findActiveSlotByToken(t),
  cancel: (t: string, nowIso: string) => cancelAppointmentByToken(t, nowIso),
};

const notFound = () => NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await lookupAppointment(token, deps);
  if (!res.found) return notFound();
  return NextResponse.json({ slotStart: res.slotStart, status: 'active' });
}

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await cancelByToken(token, deps);
  if (!res.ok) return notFound();
  return NextResponse.json({ status: 'cancelled' });
}
