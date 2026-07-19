-- ============================================================
-- 0026 — stock_movements.note: reason capture for untagged (stock) consumption
-- ============================================================
alter table public.stock_movements add column note text;
