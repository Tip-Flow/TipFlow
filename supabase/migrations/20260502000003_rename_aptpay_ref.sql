-- Rename tip_allocations.aptpay_ref → eft_ref to align with EFT branding.
-- AptPay references have been removed from the product; all payouts are
-- referred to as EFT transfers throughout the app and website.
alter table tip_allocations rename column aptpay_ref to eft_ref;
