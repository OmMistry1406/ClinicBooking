import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(process.cwd(), 'supabase', 'migrations');
const sql = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n');

describe('migrations', () => {
  it('defines a partial unique index for active slots', () => {
    expect(sql).toMatch(
      /create unique index appointments_active_slot_uniq\s+on public\.appointments \(slot_start\)\s+where status in \('pending', 'confirmed'\)/,
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

  it('allows authenticated staff select/update/delete', () => {
    for (const op of ['select', 'update', 'delete']) {
      expect(sql).toMatch(new RegExp(`for ${op} to authenticated`));
    }
    expect(sql).toContain('revoke all on table public.appointments from anon, authenticated');
    expect(sql).toContain(
      'grant select, update, delete on table public.appointments to authenticated',
    );
  });
});
