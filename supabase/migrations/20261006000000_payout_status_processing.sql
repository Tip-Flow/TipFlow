ALTER TABLE payout_requests DROP CONSTRAINT payout_requests_status_check;
ALTER TABLE payout_requests ADD CONSTRAINT payout_requests_status_check
  CHECK (status IN ('pending', 'processing', 'processed', 'failed'));
