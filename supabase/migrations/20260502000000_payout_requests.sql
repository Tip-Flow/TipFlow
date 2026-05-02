-- payout_requests: staff-initiated EFT payout requests
create table if not exists payout_requests (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff_members(id) on delete cascade,
  location_id   uuid not null references locations(id) on delete cascade,
  amount        integer not null,       -- CAD cents (gross, before fee)
  fee           integer not null default 99, -- CAD cents ($0.99)
  net_amount    integer not null,       -- CAD cents (amount - fee)
  status        text not null default 'pending' check (status in ('pending','processed','failed')),
  requested_at  timestamptz not null default now(),
  processed_at  timestamptz
);

alter table payout_requests enable row level security;

-- Staff: insert and read their own requests
create policy "Staff can insert own payout_requests"
  on payout_requests for insert to authenticated
  with check (
    staff_id in (
      select id from staff_members where email = (select email from auth.users where id = auth.uid())
    )
  );

create policy "Staff can read own payout_requests"
  on payout_requests for select to authenticated
  using (
    staff_id in (
      select id from staff_members where email = (select email from auth.users where id = auth.uid())
    )
  );

-- Managers: read and update requests for their location
create policy "Managers can read payout_requests for their location"
  on payout_requests for select to authenticated
  using (
    location_id in (
      select id from locations
    )
  );

create policy "Managers can update payout_requests for their location"
  on payout_requests for update to authenticated
  using (
    location_id in (
      select id from locations
    )
  )
  with check (
    location_id in (
      select id from locations
    )
  );
