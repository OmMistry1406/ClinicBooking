-- RLS hardening: privileges + staff DELETE policy.
-- Public writes happen only server-side with the service role (bypasses RLS).
-- anon (browser, unauthenticated) gets no table privileges at all, so direct
-- REST requests fail with 401/403 (permission denied) instead of an empty result.

revoke all on table public.appointments from anon, authenticated;
revoke all on table public.rate_limits from anon, authenticated;

-- Staff (authenticated): read, update and delete only; never insert directly.
grant select, update, delete on table public.appointments to authenticated;

create policy appointments_staff_delete on public.appointments
  for delete to authenticated using (true);

-- Defence in depth: rate_limits must never be reachable by clients.
alter table public.rate_limits force row level security;
