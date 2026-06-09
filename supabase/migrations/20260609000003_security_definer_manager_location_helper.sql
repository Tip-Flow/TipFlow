-- SECURITY DEFINER helper: returns all location IDs the calling user manages.
-- Queries managers table directly (bypassing managers RLS) to avoid the
-- RLS-in-RLS chain that fires when payout_requests policy EXISTS-subqueries
-- the managers table. With SECURITY DEFINER the function runs as postgres,
-- which has BYPASSRLS, so the chain is: payout_requests RLS → this function
-- (no further RLS) → done.
create or replace function public.current_manager_location_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  -- Location managers: directly assigned locations
  select location_id
  from managers
  where email = auth.email()
    and location_id is not null
  union
  -- Regional managers: all locations in their organisation
  select l.id
  from locations l
  join managers m on m.organisation_id = l.organisation_id
  where m.email = auth.email()
$$;

-- Replace payout_requests manager SELECT/UPDATE policies with function-based versions
drop policy if exists "Managers can read payout_requests for their location"   on payout_requests;
drop policy if exists "Managers can update payout_requests for their location" on payout_requests;

create policy "Managers can read payout_requests for their location"
  on payout_requests for select to authenticated
  using (
    auth.email() in ('sukhi.muker@gmail.com', 'sukhi@drsukhi.com')
    or location_id in (select public.current_manager_location_ids())
  );

create policy "Managers can update payout_requests for their location"
  on payout_requests for update to authenticated
  using (
    auth.email() in ('sukhi.muker@gmail.com', 'sukhi@drsukhi.com')
    or location_id in (select public.current_manager_location_ids())
  )
  with check (
    auth.email() in ('sukhi.muker@gmail.com', 'sukhi@drsukhi.com')
    or location_id in (select public.current_manager_location_ids())
  );
