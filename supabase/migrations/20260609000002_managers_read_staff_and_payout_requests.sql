-- ─────────────────────────────────────────────────────────────────
-- 1. Allow managers to read staff_members for their location(s).
--    Without this policy every embedded join on staff_members returns
--    null for managers → all staff names show as "Unknown".
-- ─────────────────────────────────────────────────────────────────
create policy "Managers can read staff_members for their location"
  on staff_members for select to authenticated
  using (
    -- Mise admins
    auth.email() in ('sukhi.muker@gmail.com', 'sukhi@drsukhi.com')
    -- Any manager whose managers row ties them to this staff member's location
    or exists (
      select 1 from managers m
      where m.email = auth.email()
        and (
          m.location_id = staff_members.location_id
          or m.organisation_id in (
            select organisation_id from locations where id = staff_members.location_id
          )
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 2. Replace the payout_requests manager SELECT/UPDATE policies.
--    The previous version used:
--      location_id in (select location_id from managers where ...)
--    which silently returns nothing when the manager's location_id
--    column is NULL (e.g. a regional manager who only has
--    organisation_id set, or a location manager not yet linked).
--
--    New version uses EXISTS with both location_id AND organisation_id
--    so both manager types see the right rows.
-- ─────────────────────────────────────────────────────────────────
drop policy if exists "Managers can read payout_requests for their location"   on payout_requests;
drop policy if exists "Managers can update payout_requests for their location" on payout_requests;

create policy "Managers can read payout_requests for their location"
  on payout_requests for select to authenticated
  using (
    auth.email() in ('sukhi.muker@gmail.com', 'sukhi@drsukhi.com')
    or exists (
      select 1 from managers m
      where m.email = auth.email()
        and (
          m.location_id = payout_requests.location_id
          or m.organisation_id in (
            select organisation_id from locations where id = payout_requests.location_id
          )
        )
    )
  );

create policy "Managers can update payout_requests for their location"
  on payout_requests for update to authenticated
  using (
    auth.email() in ('sukhi.muker@gmail.com', 'sukhi@drsukhi.com')
    or exists (
      select 1 from managers m
      where m.email = auth.email()
        and (
          m.location_id = payout_requests.location_id
          or m.organisation_id in (
            select organisation_id from locations where id = payout_requests.location_id
          )
        )
    )
  )
  with check (
    auth.email() in ('sukhi.muker@gmail.com', 'sukhi@drsukhi.com')
    or exists (
      select 1 from managers m
      where m.email = auth.email()
        and (
          m.location_id = payout_requests.location_id
          or m.organisation_id in (
            select organisation_id from locations where id = payout_requests.location_id
          )
        )
    )
  );
