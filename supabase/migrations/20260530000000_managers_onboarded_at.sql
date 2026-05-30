alter table public.managers
  add column if not exists onboarded_at timestamptz;
