import { NextResponse } from 'next/server';
import { changeStaffAppointment } from '@/server/staffAppointmentsApi';

export const dynamic = 'force-dynamic';

/** PATCH { action: 'confirm' | 'cancel' | 'no_show' } — 401 when unauthenticated. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let action: unknown;
  try {
    action = ((await request.json()) as { action?: unknown } | null)?.action;
  } catch {
    action = undefined;
  }
  const result = await changeStaffAppointment(id, action);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ appointment: result.appointment });
}
