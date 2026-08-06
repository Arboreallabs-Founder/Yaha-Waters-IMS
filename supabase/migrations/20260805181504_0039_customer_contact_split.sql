-- ============================================================
-- 0039 — Customers: split free-text contact/address into structured,
-- validated fields for the redesigned onboarding form. Legacy `contact`
-- and `address` columns are kept untouched (not dropped, not parsed) so
-- existing rows are never broken; new columns are nullable — "required"
-- for these is enforced at the application layer going forward, not a
-- DB constraint that would reject pre-existing rows.
-- ============================================================

alter table public.customers
  add column email               text,
  add column phone_country_code  text,  -- ISO2, e.g. "IN" — not the dial code (dial codes aren't unique, e.g. +1)
  add column phone_number        text,
  add column registered_address  text,
  add column delivery_address    text;
