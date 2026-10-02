import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { generateSlots, isValidDateString, subtractBooked } from '@/server/slots';

export const dynamic = 'force-dynamic';

/** Reads pending/confirmed slot starts in [fromIso, toIso) via Supabase REST using the service role (server-only). */
async function fetchBooked(fromIso: string, toIso: string): Promise<string[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured');
  const qs = new URLSearchParams({ select: 'slot_start', status: 'in.(pending,confirmed)' });
  qs.append('slot_start', `gte.${fromIso}`);
  qs.append('slot_start', `lt.${toIso}`);
  const res = await fetch(`${url}/rest/v1/appointments?${qs.toString()}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Supabase responded ${res.status}`);
  const rows = (await res.json()) as Array<{ slot_start: string }>;
  return rows.map((r) => r.slot_start);
}

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get('date') ?? '';
  if (!isValidDateString(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  try {
    const config = loadConfig();
    const all = generateSlots({
      date,
      tz: config.clinicTz,
      schedule: config.schedule,
      holidays: config.holidays,
      now: new Date(),
    });
    if (all.length === 0) return NextResponse.json({ slots: [] });
    const from = all[0]!;
    const to = new Date(Date.parse(all[all.length - 1]!) + 1000).toISOString();
    const booked = await fetchBooked(from, to);
    return NextResponse.json({ slots: subtractBooked(all, booked) });
  } catch {
    console.error('Failed to load slots');
    return NextResponse.json({ error: 'Could not load slots' }, { status: 503 });
  }
}
