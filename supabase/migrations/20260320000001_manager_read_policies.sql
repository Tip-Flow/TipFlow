-- Allow authenticated users (managers) to read all tip_allocations and staff_members.
-- The existing SELECT policies only allow staff to read their own rows, which breaks
-- the manager payouts screen nested join:
--   shifts -> tip_allocations -> staff_members
-- RLS policies for the same role are OR'd, so these add manager-level read access
-- without removing the staff self-read policies.

-- TIP_ALLOCATIONS: managers need to read all allocations to display payout breakdowns
create policy "Authenticated users can read tip_allocations"
  on tip_allocations for select
  to authenticated
  using (true);

-- STAFF_MEMBERS: managers need to read all staff to show names in payout chips
create policy "Authenticated users can read all staff_members"
  on staff_members for select
  to authenticated
  using (true);
