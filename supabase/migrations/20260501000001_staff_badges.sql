-- ============================================================
-- STAFF BADGES
-- Tracks earned gamification badges per staff member.
-- ============================================================
create table staff_badges (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references staff_members(id) on delete cascade,
  badge_key  text not null,
  earned_at  timestamptz not null default now(),
  unique (staff_id, badge_key)
);

alter table staff_badges enable row level security;

-- Staff can only see their own badges
create policy "Staff can read own badges"
  on staff_badges for select
  to authenticated
  using (
    staff_id in (
      select id from staff_members where email = auth.email()
    )
  );

-- Managers can read all badges (for leaderboard/admin views)
create policy "Authenticated users can read all badges"
  on staff_badges for select
  to authenticated
  using (true);

create policy "Authenticated users can insert badges"
  on staff_badges for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update badges"
  on staff_badges for update
  to authenticated
  using (true);

-- Seed earned badges for the demo staff member 'Alex Dubois' if they exist
insert into staff_badges (staff_id, badge_key)
select sm.id, b.badge_key
from staff_members sm
cross join (
  values
    ('first_payout'::text),
    ('ten_shifts'),
    ('top_earner'),
    ('five_day_streak')
) as b(badge_key)
where sm.name = 'Alex Dubois'
on conflict (staff_id, badge_key) do nothing;
