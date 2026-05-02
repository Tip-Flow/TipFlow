-- staff_members was missing INSERT and UPDATE policies entirely.
--
-- INSERT: check that the new row's location_id belongs to a location managed
-- by the inserting user (via regional_managers.user_id = auth.uid()).
-- The OR branch allows inserts when regional_manager_id has not been set on the
-- location yet (early-setup / single-tenant case) so existing data is not blocked.
--
-- UPDATE: allows authenticated users to update staff rows (needed for
-- invite_sent_at, payout_method, bank_linked etc.).

create policy "Managers can insert staff_members for their location"
  on staff_members for insert
  to authenticated
  with check (
    location_id in (
      select l.id
      from locations l
      left join regional_managers rm on rm.id = l.regional_manager_id
      where rm.user_id = auth.uid()          -- location is managed by this user
         or l.regional_manager_id is null    -- no manager linkage configured yet
    )
  );

create policy "Authenticated users can update staff_members"
  on staff_members for update
  to authenticated
  using (true)
  with check (true);
