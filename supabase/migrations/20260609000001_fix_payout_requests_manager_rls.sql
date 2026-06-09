-- The original manager SELECT/UPDATE policies used
--   location_id in (select id from locations)
-- which matches ALL valid rows for ANY authenticated user — too permissive.
--
-- Replace with policies scoped to the manager's own location(s):
--   • Location managers: location_id matches their managers.location_id
--   • Regional managers: location_id belongs to their organisation
--   • Mise admins: unrestricted
--
-- The UPDATE policy is widened the same way.

drop policy if exists "Managers can read payout_requests for their location"   on payout_requests;
drop policy if exists "Managers can update payout_requests for their location" on payout_requests;

create policy "Managers can read payout_requests for their location"
  on payout_requests for select to authenticated
  using (
    -- Mise admins
    auth.email() in ('sukhi.muker@gmail.com', 'sukhi@drsukhi.com')
    -- Location managers: payout is for a location they manage
    or location_id in (
      select location_id from managers
      where email = auth.email()
        and location_id is not null
    )
    -- Regional managers: payout is for any location in their organisation
    or location_id in (
      select l.id from locations l
      join managers m on m.organisation_id = l.organisation_id
      where m.email = auth.email()
        and m.role = 'regional_manager'
    )
  );

create policy "Managers can update payout_requests for their location"
  on payout_requests for update to authenticated
  using (
    auth.email() in ('sukhi.muker@gmail.com', 'sukhi@drsukhi.com')
    or location_id in (
      select location_id from managers
      where email = auth.email()
        and location_id is not null
    )
    or location_id in (
      select l.id from locations l
      join managers m on m.organisation_id = l.organisation_id
      where m.email = auth.email()
        and m.role = 'regional_manager'
    )
  )
  with check (
    auth.email() in ('sukhi.muker@gmail.com', 'sukhi@drsukhi.com')
    or location_id in (
      select location_id from managers
      where email = auth.email()
        and location_id is not null
    )
    or location_id in (
      select l.id from locations l
      join managers m on m.organisation_id = l.organisation_id
      where m.email = auth.email()
        and m.role = 'regional_manager'
    )
  );
