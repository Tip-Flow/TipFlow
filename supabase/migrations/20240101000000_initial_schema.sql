-- uuid-ossp extension not required; gen_random_uuid() is built into PostgreSQL 13+

-- ============================================================
-- LOCATIONS
-- ============================================================
create table locations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  city             text not null,
  pos_type         text,
  cra_tip_type     text,
  aptpay_merchant_id text,
  created_at       timestamptz not null default now()
);

alter table locations enable row level security;

-- All authenticated users can read locations
create policy "Authenticated users can read locations"
  on locations for select
  to authenticated
  using (true);

-- ============================================================
-- STAFF MEMBERS
-- ============================================================
create table staff_members (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid not null references locations(id) on delete cascade,
  name           text not null,
  role           text not null,
  email          text,
  flinks_token   text,
  payout_method  text,
  bank_linked    boolean not null default false,
  created_at     timestamptz not null default now()
);

alter table staff_members enable row level security;

-- Staff can only read their own row (matched by email to auth.email())
create policy "Staff can read own record"
  on staff_members for select
  to authenticated
  using (email = auth.email());

-- ============================================================
-- SHIFTS
-- ============================================================
create table shifts (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references locations(id) on delete cascade,
  date         date not null,
  name         text not null,
  total_tips   numeric(10, 2) not null default 0,
  total_sales  numeric(10, 2) not null default 0,
  status       text not null default 'pending',
  pos_source   text,
  created_at   timestamptz not null default now()
);

alter table shifts enable row level security;

-- All authenticated users can read shifts (managers need full access;
-- staff access is scoped via tip_allocations)
create policy "Authenticated users can read shifts"
  on shifts for select
  to authenticated
  using (true);

-- ============================================================
-- TIP ALLOCATIONS
-- ============================================================
create table tip_allocations (
  id                 uuid primary key default gen_random_uuid(),
  shift_id           uuid not null references shifts(id) on delete cascade,
  staff_id           uuid not null references staff_members(id) on delete cascade,
  hours_worked       numeric(5, 2) not null default 0,
  role_weight        numeric(5, 4) not null default 1.0,
  calculated_amount  numeric(10, 2) not null default 0,
  aptpay_ref         text,
  paid_at            timestamptz,
  cash_confirmed     boolean not null default false,
  created_at         timestamptz not null default now()
);

alter table tip_allocations enable row level security;

-- Staff can only read their own tip allocations
create policy "Staff can read own tip allocations"
  on tip_allocations for select
  to authenticated
  using (
    staff_id in (
      select id from staff_members where email = auth.email()
    )
  );
