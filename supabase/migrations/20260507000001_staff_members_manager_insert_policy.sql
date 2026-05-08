-- The existing INSERT policy on staff_members only checks regional_managers.user_id.
-- Location managers live in the managers table (auth_user_id). This policy adds
-- that path so location managers can insert staff for their assigned location.
create policy "Location managers can insert staff for their location"
  on staff_members for insert
  to authenticated
  with check (
    location_id in (
      select m.location_id
      from managers m
      where m.auth_user_id = auth.uid()
        and m.location_id is not null
    )
  );
