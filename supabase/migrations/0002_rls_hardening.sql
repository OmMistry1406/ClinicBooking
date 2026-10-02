-- RLS hardening: privileges + staff DELETE policy.
-- Split of responsibility: 0001_init.sql creates the full schema (columns, constraints,
-- partial unique index, rate_limits) and the staff SELECT and UPDATE policies
-- (appointments_staff_select / appointments_staff_update, both `to authenticated`).
-- This migration adds table privileges and the staff DELETE policy, completing
-- SELECT/UPDATE/DELETE for authenticated staff.
-- Public writes happen only server-side with the service role (bypasses RLS).
-- anon (browser, unauthenticated) gets no table privileges at all, so direct
-- REST requests fail with 401/403 (permission denied) instead of an empty result.

revoke all on table public.appointments from anon, authenticated;
revoke all on table public.rate_limits from anon, authenticated;

-- Staff (authenticated): read, update and delete only; never insert directly.
grant select, update, delete on table public.appointments to authenticated;

-- Re-assert all three staff policies here (idempotent: drop + create) so the RLS
-- configuration is complete and reviewable in one place, regardless of 0001.
drop policy if exists appointments_staff_select on public.appointments;
create policy appointments_staff_select on public.appointments
  for select to authenticated using (true);

drop policy if exists appointments_staff_update on public.appointments;
create policy appointments_staff_update on public.appointments
  for update to authenticated using (true) with check (true);

drop policy if exists appointments_staff_delete on public.appointments;
create policy appointments_staff_delete on public.appointments
  for delete to authenticated using (true);

-- Defence in depth: rate_limits must never be reachable by clients.
alter table public.rate_limits force row level security;
