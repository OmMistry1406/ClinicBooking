/** Service-role access to Supabase REST. Server-side only; never import from client components. */

function env(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured');
  return { url, key };
}

export function adminUrl(path: string): string {
  return `${env().url}${path}`;
}

export function adminHeaders(): Record<string, string> {
  const { key } = env();
  return { apikey: key, Authorization: `Bearer ${key}` };
}

export interface AppointmentRow {
  slot_start: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  status: 'pending';
  cancel_token: string;
  consent_at: string;
}

export type InsertResult = { ok: true } | { ok: false; code: 'slot_taken' | 'unavailable' };

/** Inserts an appointment. Maps Postgres unique violation 23505 to 'slot_taken'. Never check-then-insert. */
export async function insertAppointment(
  row: AppointmentRow,
  fetchImpl: typeof fetch = fetch,
): Promise<InsertResult> {
  try {
    const res = await fetchImpl(adminUrl('/rest/v1/appointments'), {
      method: 'POST',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
      cache: 'no-store',
    });
    if (res.ok) return { ok: true };
    if (res.status === 409) {
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      if (body.code === '23505') return { ok: false, code: 'slot_taken' };
    }
    return { ok: false, code: 'unavailable' };
  } catch {
    return { ok: false, code: 'unavailable' };
  }
}
