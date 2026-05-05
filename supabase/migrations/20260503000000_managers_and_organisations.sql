-- ============================================================
-- ORGANISATIONS (may already exist)
-- ============================================================
create table if not exists organisations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  city       text,
  country    text,
  created_at timestamptz not null default now()
);

alter table organisations enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'organisations'
      and policyname = 'Authenticated users can read organisations'
  ) then
    create policy "Authenticated users can read organisations"
      on organisations for select to authenticated using (true);
  end if;
end $$;

-- ============================================================
-- Link locations to organisations
-- ============================================================
alter table locations
  add column if not exists organisation_id uuid references organisations(id);

-- ============================================================
-- MANAGERS
-- ============================================================
create table if not exists managers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  email           text not null,
  role            text not null check (role in ('regional_manager', 'location_manager')),
  organisation_id uuid references organisations(id) on delete set null,
  location_id     uuid references locations(id) on delete set null,
  auth_user_id    uuid references auth.users(id),
  invite_sent_at  timestamptz,
  created_at      timestamptz not null default now()
);

alter table managers enable row level security;

-- Security-definer helper: bypasses RLS to get caller's org
create or replace function public.get_current_manager_org()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select organisation_id from public.managers
  where email = auth.email()
  limit 1;
$$;

-- Managers can read every row in their org (or their own row)
drop policy if exists "Managers can read same-org managers" on managers;
create policy "Managers can read same-org managers"
  on managers for select to authenticated
  using (
    email = auth.email()
    or organisation_id = public.get_current_manager_org()
  );

-- ============================================================
-- Extend the auth signup trigger to also link managers
-- ============================================================
create or replace function public.handle_staff_invite_signup()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.staff_members
  set auth_user_id = new.id
  where email = new.email
    and auth_user_id is null;

  update public.managers
  set auth_user_id = new.id
  where email = new.email
    and auth_user_id is null;

  return new;
end;
$$;
