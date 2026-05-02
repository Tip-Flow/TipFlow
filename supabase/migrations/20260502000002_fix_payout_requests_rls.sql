-- The original INSERT policy used a subquery on auth.users which can be
-- unreliable in RLS contexts. Replace with auth.email() which is the
-- Supabase-recommended way to get the current user's email in policies.
-- Same fix applied to the SELECT policy for consistency.

drop policy if exists "Staff can insert own payout_requests" on payout_requests;
drop policy if exists "Staff can read own payout_requests" on payout_requests;

create policy "Staff can insert own payout_requests"
  on payout_requests for insert to authenticated
  with check (
    staff_id in (
      select id from staff_members where email = auth.email()
    )
  );

create policy "Staff can read own payout_requests"
  on payout_requests for select to authenticated
  using (
    staff_id in (
      select id from staff_members where email = auth.email()
    )
  );
