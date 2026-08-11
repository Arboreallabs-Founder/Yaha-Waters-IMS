-- ============================================================
-- 0046 — GRN challan/invoice numbers must never repeat for the same
-- vendor. Scoped per-vendor (not globally) since two different vendors
-- legitimately number their own challans/invoices independently — a
-- collision only matters within one vendor's numbering. GRNs with no
-- vendor tagged are bucketed together via coalesce() so "no vendor"
-- GRNs still can't repeat a challan/invoice among themselves.
-- Normalized (lower + trim) so "INV-123" and "inv-123 " are caught as
-- the same number. Partial (WHERE ... IS NOT NULL) so GRNs missing one
-- of the two numbers don't collide on NULL.
-- ============================================================

create unique index uq_grns_challan_per_vendor
  on public.grns (coalesce(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(challan_no)))
  where challan_no is not null and trim(challan_no) <> '';

create unique index uq_grns_invoice_per_vendor
  on public.grns (coalesce(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(invoice_no)))
  where invoice_no is not null and trim(invoice_no) <> '';
