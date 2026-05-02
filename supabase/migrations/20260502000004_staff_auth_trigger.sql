-- Add auth_user_id to staff_members so we can link the Supabase auth record
-- back to the staff row after the invited user sets their password.
alter table staff_members
  add column if not exists auth_user_id uuid references auth.users(id);

-- Function: when a new auth.users row is created (invite accepted or direct
-- signup), find the matching staff_members row by email and store the auth id.
create or replace function public.handle_staff_invite_signup()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.staff_members
  set auth_user_id = new.id
  where email = new.email
    and auth_user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_staff_invite on auth.users;
create trigger on_auth_user_staff_invite
  after insert on auth.users
  for each row execute function public.handle_staff_invite_signup();
