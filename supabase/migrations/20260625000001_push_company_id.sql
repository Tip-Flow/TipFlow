-- Push Operations integration columns on locations
alter table locations
  add column if not exists push_company_id       integer,
  add column if not exists push_labour_cache      jsonb,
  add column if not exists push_labour_cache_date date;

-- Managers can update Push labour cache (needed by sync-push-labour edge function via service key)
-- The edge function uses service role so RLS is bypassed — no extra policy needed.

-- Set push_company_id for Ossington test location
-- (Granville Warehouse Restaurant Inc. company ID 29012 maps to the Ossington location for testing)
update locations
  set push_company_id = 29012
  where lower(name) like '%ossington%';
