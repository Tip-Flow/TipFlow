-- Allow authenticated users (managers) to insert shifts and tip_allocations.
-- RLS is enforced at the application layer (manager role check on login).
-- Staff can only read their own rows via the existing SELECT policies.

-- SHIFTS: managers can insert and update
create policy "Authenticated users can insert shifts"
  on shifts for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update shifts"
  on shifts for update
  to authenticated
  using (true);

-- TIP_ALLOCATIONS: managers can insert
create policy "Authenticated users can insert tip_allocations"
  on tip_allocations for insert
  to authenticated
  with check (true);
