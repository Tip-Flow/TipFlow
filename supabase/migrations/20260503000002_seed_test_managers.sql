-- Seed test manager accounts so login routing works for demo accounts.
-- Uses WHERE NOT EXISTS so re-running is safe.

-- regional@canteen.ca → regional_manager
insert into public.managers (name, email, role, organisation_id, location_id, auth_user_id)
select
  'Regional Manager',
  'regional@canteen.ca',
  'regional_manager',
  o.id,
  null,
  u.id
from organisations o, auth.users u
where u.email = 'regional@canteen.ca'
  and not exists (
    select 1 from public.managers where email = 'regional@canteen.ca'
  )
limit 1;

-- jamie@canteen.ca → location_manager, linked to first available location
insert into public.managers (name, email, role, organisation_id, location_id, auth_user_id)
select
  'Jamie Manager',
  'jamie@canteen.ca',
  'location_manager',
  o.id,
  l.id,
  u.id
from organisations o, locations l, auth.users u
where u.email = 'jamie@canteen.ca'
  and not exists (
    select 1 from public.managers where email = 'jamie@canteen.ca'
  )
limit 1;
