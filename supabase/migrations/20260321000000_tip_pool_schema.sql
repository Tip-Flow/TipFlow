-- ============================================================
-- ORGANISATIONS
-- ============================================================
create table organisations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

alter table organisations enable row level security;

create policy "Authenticated users can read organisations"
  on organisations for select
  to authenticated
  using (true);

create policy "Authenticated users can insert organisations"
  on organisations for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update organisations"
  on organisations for update
  to authenticated
  using (true);

-- ============================================================
-- REGIONAL MANAGERS
-- ============================================================
create table regional_managers (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  email           text not null,
  created_at      timestamptz not null default now()
);

alter table regional_managers enable row level security;

create policy "Authenticated users can read regional_managers"
  on regional_managers for select
  to authenticated
  using (true);

create policy "Authenticated users can insert regional_managers"
  on regional_managers for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update regional_managers"
  on regional_managers for update
  to authenticated
  using (true);

-- ============================================================
-- UPDATE LOCATIONS — add org / regional manager / house pool columns
-- ============================================================
alter table locations
  add column organisation_id      uuid references organisations(id) on delete set null,
  add column regional_manager_id  uuid references regional_managers(id) on delete set null,
  add column house_pool_pay_period text not null default 'biweekly',
  add column house_pool_balance    integer not null default 0;

-- ============================================================
-- TIP OUT RULES
-- ============================================================
create table tip_out_rules (
  id                  uuid primary key default gen_random_uuid(),
  location_id         uuid not null references locations(id) on delete cascade,
  role_name           text not null,
  percentage_of_sales numeric(5, 4) not null,
  payout_type         text not null,  -- 'direct' | 'house_pool'
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

alter table tip_out_rules enable row level security;

create policy "Authenticated users can read tip_out_rules"
  on tip_out_rules for select
  to authenticated
  using (true);

create policy "Authenticated users can insert tip_out_rules"
  on tip_out_rules for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update tip_out_rules"
  on tip_out_rules for update
  to authenticated
  using (true);

-- ============================================================
-- HOUSE POOL ROLES
-- ============================================================
create table house_pool_roles (
  id                uuid primary key default gen_random_uuid(),
  location_id       uuid not null references locations(id) on delete cascade,
  staff_member_id   uuid not null references staff_members(id) on delete cascade,
  distribution_type text not null,          -- 'fixed' | 'points'
  fixed_amount      integer,                -- cents; used when distribution_type = 'fixed'
  points_per_hour   numeric(5, 2),          -- used when distribution_type = 'points'
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

alter table house_pool_roles enable row level security;

create policy "Authenticated users can read house_pool_roles"
  on house_pool_roles for select
  to authenticated
  using (true);

create policy "Authenticated users can insert house_pool_roles"
  on house_pool_roles for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update house_pool_roles"
  on house_pool_roles for update
  to authenticated
  using (true);

-- ============================================================
-- HOUSE POOL PAYOUTS
-- ============================================================
create table house_pool_payouts (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references locations(id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  total_pool   integer not null default 0,  -- cents
  status       text not null default 'pending',  -- 'pending' | 'paid'
  created_at   timestamptz not null default now()
);

alter table house_pool_payouts enable row level security;

create policy "Authenticated users can read house_pool_payouts"
  on house_pool_payouts for select
  to authenticated
  using (true);

create policy "Authenticated users can insert house_pool_payouts"
  on house_pool_payouts for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update house_pool_payouts"
  on house_pool_payouts for update
  to authenticated
  using (true);

-- ============================================================
-- HOUSE POOL ALLOCATIONS
-- ============================================================
create table house_pool_allocations (
  id                   uuid primary key default gen_random_uuid(),
  house_pool_payout_id uuid not null references house_pool_payouts(id) on delete cascade,
  staff_member_id      uuid not null references staff_members(id) on delete cascade,
  hours_worked         numeric(5, 2) not null default 0,
  points_earned        numeric(8, 2),  -- hours × points_per_hour; null for fixed distribution
  fixed_amount         integer,        -- cents; null for points-based distribution
  calculated_amount    integer not null default 0,  -- final amount in cents
  aptpay_ref           text,
  paid_at              timestamptz
);

alter table house_pool_allocations enable row level security;

-- Staff can only see their own allocations
create policy "Staff can read own house_pool_allocations"
  on house_pool_allocations for select
  to authenticated
  using (
    staff_member_id in (
      select id from staff_members where email = auth.email()
    )
  );

create policy "Authenticated users can insert house_pool_allocations"
  on house_pool_allocations for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update house_pool_allocations"
  on house_pool_allocations for update
  to authenticated
  using (true);

-- ============================================================
-- SHIFT GOALS
-- ============================================================
create table shift_goals (
  id               uuid primary key default gen_random_uuid(),
  location_id      uuid not null references locations(id) on delete cascade,
  shift_id         uuid not null references shifts(id) on delete cascade,
  created_by       uuid not null references auth.users(id),
  title            text not null,
  description      text,
  goal_type        text not null,  -- 'top_sales' | 'most_upsells' | 'specific_item' | 'manager_choice'
  target_item      text,
  is_active        boolean not null default true,
  winner_staff_id  uuid references staff_members(id) on delete set null,
  created_at       timestamptz not null default now()
);

alter table shift_goals enable row level security;

create policy "Authenticated users can read shift_goals"
  on shift_goals for select
  to authenticated
  using (true);

create policy "Authenticated users can insert shift_goals"
  on shift_goals for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update shift_goals"
  on shift_goals for update
  to authenticated
  using (true);

-- ============================================================
-- POINTS CHANGE REQUESTS
-- ============================================================
create table points_change_requests (
  id               uuid primary key default gen_random_uuid(),
  location_id      uuid not null references locations(id) on delete cascade,
  requested_by     uuid not null references auth.users(id),
  role_name        text not null,
  current_points   numeric(5, 2) not null,
  requested_points numeric(5, 2) not null,
  reason           text,
  status           text not null default 'pending',  -- 'pending' | 'approved' | 'rejected'
  reviewed_by      uuid references auth.users(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);

alter table points_change_requests enable row level security;

create policy "Authenticated users can read points_change_requests"
  on points_change_requests for select
  to authenticated
  using (true);

create policy "Authenticated users can insert points_change_requests"
  on points_change_requests for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update points_change_requests"
  on points_change_requests for update
  to authenticated
  using (true);

-- ============================================================
-- UPDATE TIP ALLOCATIONS — add tip-out breakdown columns
-- ============================================================
alter table tip_allocations
  add column server_sales           integer,  -- server's total sales in cents
  add column total_tip_out          integer,  -- total amount tipped out in cents
  add column direct_tip_outs        integer,  -- portion going directly to other roles
  add column house_pool_contribution integer, -- portion going to house pool
  add column tips_kept              integer;  -- net amount the server keeps in cents
