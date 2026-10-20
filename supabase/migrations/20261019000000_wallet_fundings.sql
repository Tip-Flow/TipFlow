create table public.wallet_fundings (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  location_id uuid not null references public.locations(id),
  amount_cents integer not null check (amount_cents between 100 and 5000000),
  requested_by uuid not null references auth.users(id),
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'failed', 'needs_review')),
  zumrails_transaction_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index wallet_fundings_one_open_per_location
  on public.wallet_fundings (location_id)
  where status in ('processing', 'needs_review');

alter table public.wallet_fundings enable row level security;
