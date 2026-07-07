-- Squirrel POS integration columns on locations
alter table locations
  add column if not exists squirrel_sales_cache      jsonb,
  add column if not exists squirrel_sales_cache_date date;

-- The sync-squirrel-sales edge function uses the service role key, so RLS is
-- bypassed when writing the cache — no extra policy needed.
