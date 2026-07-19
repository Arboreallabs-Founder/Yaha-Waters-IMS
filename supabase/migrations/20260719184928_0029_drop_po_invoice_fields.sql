-- ============================================================
-- 0029 — Remove PO invoice tracking (invoice_no / invoice_status) and the
-- "Invoice vs PO" reconciliation check built on it.
-- ============================================================
drop view if exists public.v_invoice_vs_po;

-- v_purchase_orders_safe depends on these columns — recreate without them.
drop view if exists public.v_purchase_orders_safe;

alter table public.purchase_orders
  drop column invoice_no,
  drop column invoice_status;

create view public.v_purchase_orders_safe
with (security_invoker = true) as
select id, po_no, vendor_id, po_date, status, is_informal, source,
       created_at, updated_at, created_by
from public.purchase_orders;

grant select on public.v_purchase_orders_safe to authenticated;
