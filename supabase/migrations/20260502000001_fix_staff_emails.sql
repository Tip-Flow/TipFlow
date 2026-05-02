-- Fix staff member emails to match their Supabase auth accounts.
-- Auth emails: alex@canteen.ca, maria@canteen.ca, jordan@canteen.ca, taylor@canteen.ca
-- The staff_members table had placeholder or mismatched emails so the
-- email-based RLS join and loadData lookup were returning no rows.

update staff_members set email = 'alex@canteen.ca'
  where lower(name) like '%alex%';

update staff_members set email = 'maria@canteen.ca'
  where lower(name) like '%maria%';

update staff_members set email = 'jordan@canteen.ca'
  where lower(name) like '%jordan%';

update staff_members set email = 'taylor@canteen.ca'
  where lower(name) like '%taylor%';
