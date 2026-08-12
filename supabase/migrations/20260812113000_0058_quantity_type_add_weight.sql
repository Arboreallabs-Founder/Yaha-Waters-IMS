-- ============================================================
-- 0058 — Add 'weight' to quantity_type, ahead of 0059's piece_weight
-- columns/RPC wiring. Split into its own migration because a newly added
-- enum value can't be used in the same transaction that adds it.
-- ============================================================

alter type public.quantity_type add value 'weight';
