-- Allow authenticated users (managers) to update tip_allocations.
-- Required for the payout flow: marking allocations as paid with aptpay_ref + paid_at.

create policy "Authenticated users can update tip_allocations"
  on tip_allocations for update
  to authenticated
  using (true);
