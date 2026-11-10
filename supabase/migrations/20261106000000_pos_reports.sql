-- One row per uploaded end-of-night report (PDF).
create table public.pos_reports (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id),
  business_date date not null,
  storage_path text not null,
  file_sha256 text not null,
  uploaded_by uuid not null references auth.users(id),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'parsed', 'needs_review', 'confirmed', 'rejected')),
  parser_version text,
  report_totals jsonb,
  review_notes text,
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The exact same file can't be uploaded twice for a location.
  unique (location_id, file_sha256)
);

-- Only one confirmed report per location per day.
create unique index pos_reports_one_confirmed_per_day
  on public.pos_reports (location_id, business_date)
  where status = 'confirmed';

-- One row per server line read from a report. All money in cents.
create table public.pos_report_lines (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.pos_reports(id) on delete cascade,
  pos_employee_key text not null,
  pos_employee_name text not null,
  staff_member_id uuid references public.staff_members(id),
  net_sales_cents integer not null default 0,
  category_sales jsonb not null default '{}'::jsonb,
  card_tips_cents integer not null default 0,
  cash_tips_cents integer not null default 0,
  service_charge_cents integer not null default 0,
  check_count integer,
  created_at timestamptz not null default now(),
  unique (report_id, pos_employee_key)
);

-- Remembers which name/number on the report is which Mise staff member.
create table public.pos_employee_map (
  location_id uuid not null references public.locations(id),
  pos_employee_key text not null,
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (location_id, pos_employee_key)
);

alter table public.pos_reports enable row level security;
alter table public.pos_report_lines enable row level security;
alter table public.pos_employee_map enable row level security;

-- Private storage for the original PDFs (10 MB max, PDFs only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pos-reports', 'pos-reports', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;