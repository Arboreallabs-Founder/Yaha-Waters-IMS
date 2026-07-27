-- ============================================================
-- 0033 — GRN: record the vendor's invoice number alongside the challan
-- number (goods often arrive with a delivery challan and a separate tax
-- invoice reference; both need to be captured for accounting/matching).
-- ============================================================

alter table public.grns add column invoice_no text;
