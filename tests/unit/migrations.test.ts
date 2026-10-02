import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(process.cwd(), 'supabase', 'migrations');
const sql = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n')
  // Case-insensitive matching: SQL keywords may be upper or lower case.
  .toLowerCase();

describe('migrations', () => {
  it('defines a partial unique index for active slots', () => {
    expect(sql).toMatch(
      /create unique index appointments_active_slot_uniq\s+on public\.appointments \(slot_start\)\s+where status in \('pending', 'confirmed'\)/i,
    );
  });

  it('constrains status and cancelled_by', () => {
    expect(sql).toContain("check (status in ('pending', 'confirmed', 'cancelled', 'no_show'))");
    expect(sql).toContain("check (cancelled_by in ('patient', 'staff'))");
  });

  it('enables RLS and has no anon or insert policies', () => {
    expect(sql).toContain('alter table public.appointments enable row level security');
    expect(sql).not.toMatch(/create policy[^;]*to anon/i);
    expect(sql).not.toMatch(/create policy[^;]*for insert/i);
  });

  it('keeps rate_limits and its function away from clients', () => {
    expect(sql).toContain('alter table public.rate_limits enable row level security');
    expect(sql).toContain('revoke all on table public.rate_limits from anon, authenticated');
    expect(sql).toContain('grant execute on function public.hit_rate_limit(text, int, int) to service_role');
  });

  it('disables public sign-up and requires 12+ char passwords', () => {
    const toml = readFileSync(join(process.cwd(), 'supabase', 'config.toml'), 'utf8');
    expect(toml).toMatch(/enable_signup = false/);
    expect(toml).toMatch(/minimum_password_length = 12/);
  });

  it('allows authenticated staff select/update/delete', () => {
    for (const op of ['select', 'update', 'delete']) {
      expect(sql).toMatch(new RegExp(`for ${op} to authenticated`, 'i'));
    }
    expect(sql).toContain('revoke all on table public.appointments from anon, authenticated');
    expect(sql).toContain(
      'grant select, update, delete on table public.appointments to authenticated',
    );
  });
});
