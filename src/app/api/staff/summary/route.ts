import { NextResponse } from 'next/server';
import { fetchStaffSummary } from '@/server/staffAppointmentsApi';

export const dynamic = 'force-dynamic';

/** GET ?view=day|week&date=YYYY-MM-DD -> { total, pending, confirmed, cancelled, no_show, list, ... } */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const result = await fetchStaffSummary(params.get('view'), params.get('date'));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.summary);
}
