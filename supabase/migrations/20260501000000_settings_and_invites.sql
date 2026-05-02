-- Add last_house_pool_payout_at to locations (queried by housepool.tsx)
alter table locations
  add column if not exists last_house_pool_payout_at timestamptz;

-- Add invite tracking to staff_members
alter table staff_members
  add column if not exists invite_sent_at timestamptz;

-- Delete policy for tip_out_rules (needed for replace-all save pattern)
create policy "Authenticated users can delete tip_out_rules"
  on tip_out_rules for delete
  to authenticated
  using (true);

-- ============================================================
-- ORGANISATION SETTINGS
-- Stores global default tip-out rules and pay period per org.
-- ============================================================
create table organisation_settings (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid unique references organisations(id) on delete cascade,
  server_pct       numeric(5,2) not null default 70,
  bartender_pct    numeric(5,2) not null default 60,
  runner_pct       numeric(5,2) not null default 30,
  host_pct         numeric(5,2) not null default 20,
  server_pts       numeric(5,2) not null default 2.5,
  bartender_pts    numeric(5,2) not null default 2.0,
  runner_pts       numeric(5,2) not null default 1.25,
  host_pts         numeric(5,2) not null default 1.0,
  kitchen_pts      numeric(5,2) not null default 1.5,
  pay_period       text not null default 'Bi-weekly',
  updated_at       timestamptz not null default now()
);

alter table organisation_settings enable row level security;

create policy "Authenticated users can read organisation_settings"
  on organisation_settings for select
  to authenticated
  using (true);

create policy "Authenticated users can insert organisation_settings"
  on organisation_settings for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update organisation_settings"
  on organisation_settings for update
  to authenticated
  using (true);
