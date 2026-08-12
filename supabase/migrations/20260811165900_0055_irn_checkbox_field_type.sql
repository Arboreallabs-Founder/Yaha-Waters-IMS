-- ============================================================
-- 0055 — Add 'checkbox' to irn_field_type, ahead of 0056 seeding
-- checkbox-typed inspection_template_fields. Split into its own
-- migration because a newly added enum value can't be used in the
-- same transaction that adds it.
-- ============================================================

alter type public.irn_field_type add value 'checkbox';
