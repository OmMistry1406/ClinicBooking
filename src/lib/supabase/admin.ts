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

/** Selects ONLY slot_start (no PII) for a non-cancelled appointment with this token. */
export async function findActiveSlotByToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const res = await fetchImpl(
    adminUrl(
      `/rest/v1/appointments?select=slot_start&cancel_token=eq.${encodeURIComponent(token)}&status=neq.cancelled&limit=1`,
    ),
    { headers: adminHeaders(), cache: 'no-store' },
  );
  if (!res.ok) throw new Error('lookup failed');
  const rows = (await res.json()) as Array<{ slot_start: string }>;
  return rows[0]?.slot_start ?? null;
}

/** Patient cancellation: single conditional UPDATE. Returns true if a row changed. */
export async function cancelAppointmentByToken(
  token: string,
  nowIso: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const res = await fetchImpl(
    adminUrl(
      `/rest/v1/appointments?select=id&cancel_token=eq.${encodeURIComponent(token)}&status=neq.cancelled`,
    ),
    {
      method: 'PATCH',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'cancelled', cancelled_by: 'patient', updated_at: nowIso }),
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error('cancel failed');
  const rows = (await res.json()) as unknown[];
  return rows.length > 0;
}

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
