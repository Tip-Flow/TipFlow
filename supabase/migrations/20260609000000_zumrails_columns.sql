-- Zum Rails payment identifiers
alter table staff_members  add column if not exists zumrails_user_id          text;
alter table locations       add column if not exists zumrails_funding_source_id text;
alter table payout_requests add column if not exists zumrails_transaction_id   text;
