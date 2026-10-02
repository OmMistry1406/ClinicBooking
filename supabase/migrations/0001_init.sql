-- Initial schema: appointments, rate limiting, RLS. No automatic deletion (FR-13: retain >= 365 days).

create extension if not exists pgcrypto;

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  slot_start timestamptz not null,
  name text not null check (char_length(name) between 1 and 100),
  phone text not null check (char_length(phone) between 7 and 20),
  email text null check (char_length(email) <= 254),
  notes text null check (char_length(notes) <= 500),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'no_show')),
  cancel_token text not null unique,
  cancelled_by text null check (cancelled_by in ('patient', 'staff')),
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cancelled_by_only_when_cancelled
    check (cancelled_by is null or status = 'cancelled')
);

-- FR-03: one active appointment per slot, enforced by the database.
create unique index appointments_active_slot_uniq
  on public.appointments (slot_start)
  where status in ('pending', 'confirmed');

create index appointments_slot_start_idx on public.appointments (slot_start);
create index appointments_phone_idx on public.appointments (phone);

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

alter table public.appointments enable row level security;

create policy appointments_staff_select on public.appointments
  for select to authenticated using (true);
create policy appointments_staff_update on public.appointments
  for update to authenticated using (true) with check (true);

-- Rate limiting / login lockout counters (service role only; no policies).
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);

alter table public.rate_limits enable row level security;

create function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns table (allowed boolean, current_count int)
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case
      when r.window_start <= now() - make_interval(secs => p_window_seconds) then now()
      else r.window_start end,
    count = case
      when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1
      else r.count + 1 end
  returning r.count into v_count;

  return query select v_count <= p_max, v_count;
end;
$$;

revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;
