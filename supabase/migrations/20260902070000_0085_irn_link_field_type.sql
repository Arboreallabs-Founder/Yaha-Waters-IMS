-- ============================================================
-- 0085 — Add 'link' to irn_field_type, ahead of 0086's
-- show_on_printout column + submit_irn fix. Split into its own
-- migration because a newly added enum value can't be used in the
-- same transaction that adds it (same precedent as 0055).
-- ============================================================

alter type public.irn_field_type add value 'link';
