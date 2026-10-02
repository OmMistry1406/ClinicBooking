import { NextResponse } from 'next/server';
import { fetchStaffAppointments } from '@/server/staffAppointmentsApi';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get('date');
  const result = await fetchStaffAppointments(date);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ date: result.date, appointments: result.appointments });
}
