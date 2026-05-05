-- Add city and country columns to organisations (missing from original schema)
alter table organisations
  add column if not exists city    text,
  add column if not exists country text;

-- Add INSERT policy on locations (none existed — blocked all inserts)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'locations'
      and policyname = 'Authenticated users can insert locations'
  ) then
    create policy "Authenticated users can insert locations"
      on locations for insert
      to authenticated
      with check (true);
  end if;
end $$;

-- Add UPDATE policy on locations so admins can patch rows
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'locations'
      and policyname = 'Authenticated users can update locations'
  ) then
    create policy "Authenticated users can update locations"
      on locations for update
      to authenticated
      using (true);
  end if;
end $$;
