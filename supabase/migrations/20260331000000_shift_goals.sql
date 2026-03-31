-- ============================================================
-- SHIFT GOALS
-- ============================================================
create table shift_goals (
  id               uuid primary key default gen_random_uuid(),
  shift_id         uuid not null references shifts(id) on delete cascade,
  location_id      uuid not null references locations(id) on delete cascade,
  title            text not null,
  goal_type        text not null check (goal_type in ('top_sales', 'most_upsells', 'specific_item', 'managers_choice')),
  target_item      text,                          -- only set when goal_type = 'specific_item'
  winner_staff_id  uuid references staff_members(id) on delete set null,
  created_by       uuid,                          -- manager's auth uid
  created_at       timestamptz not null default now()
);

alter table shift_goals enable row level security;

-- Managers can do everything on shift_goals for their location
create policy "Authenticated users can read shift goals"
  on shift_goals for select
  to authenticated
  using (true);

create policy "Authenticated users can insert shift goals"
  on shift_goals for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update shift goals"
  on shift_goals for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete shift goals"
  on shift_goals for delete
  to authenticated
  using (true);
