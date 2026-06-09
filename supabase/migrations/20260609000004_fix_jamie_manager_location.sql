-- Jamie's manager row was created before the seed migration ran, so the
-- NOT EXISTS guard in 20260503000002 prevented setting location_id.
-- Assign Jamie to the location that has the most recent payout request
-- (which is the actual test location we want Jamie to manage).
update managers
set location_id = (
  select location_id
  from payout_requests
  order by requested_at desc
  limit 1
)
where email = 'jamie@canteen.ca'
  and location_id is null;
