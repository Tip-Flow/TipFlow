-- Allow authenticated users (managers) to delete tip_allocations.
-- Required for the Save & Pay Out flow: when re-calculating an active shift,
-- existing stub allocations are deleted before inserting final calculated ones.

create policy "Authenticated users can delete tip_allocations"
  on tip_allocations for delete
  to authenticated
  using (true);
