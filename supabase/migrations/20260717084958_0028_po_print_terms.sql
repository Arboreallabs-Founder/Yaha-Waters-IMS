-- ============================================================
-- 0028 — PO print fields: per-order delivery/payment/freight terms + GST %
-- (needed for the printed PO template; defaults match the company's real
-- historical PO wording).
-- ============================================================
alter table public.purchase_orders
  add column delivery_terms text not null default 'Urgent',
  add column payment_terms text not null default '30 Days',
  add column freight_terms text not null default 'At Actual',
  add column gst_percent   numeric not null default 18;
