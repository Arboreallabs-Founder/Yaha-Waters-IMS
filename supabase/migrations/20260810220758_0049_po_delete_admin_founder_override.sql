-- ============================================================
-- 0049 — Admin and Founder can delete ANY purchase order, including a PO
-- that's part of a revision chain (root or a clone). The original design
-- made revisioned POs permanently undeletable by anyone, on the theory
-- that a broken link would corrupt the printable revision history — but
-- that left no way to clean up mistakes/test data, which real usage
-- immediately ran into. Admin/Founder now get an explicit override;
-- Team Lead keeps the original narrow rule (draft, never revisioned).
--
-- Relaxing root_po_id/superseded_by from ON DELETE RESTRICT to ON DELETE
-- SET NULL: deleting a row that something else points to now cleanly
-- detaches that reference instead of blocking the delete.
--   - Deleting the CURRENT/live revision nulls its predecessor's
--     superseded_by — the predecessor naturally becomes "current" again,
--     which is exactly the right semantics (nothing supersedes it anymore).
--   - Deleting the ROOT nulls root_po_id on any remaining revisions —
--     they become standalone rows (no longer part of a printable lineage,
--     an acceptable consequence of deliberately deleting the root).
-- ============================================================

alter table public.purchase_orders drop constraint purchase_orders_root_po_id_fkey;
alter table public.purchase_orders
  add constraint purchase_orders_root_po_id_fkey
  foreign key (root_po_id) references public.purchase_orders(id) on delete set null;

alter table public.purchase_orders drop constraint purchase_orders_superseded_by_fkey;
alter table public.purchase_orders
  add constraint purchase_orders_superseded_by_fkey
  foreign key (superseded_by) references public.purchase_orders(id) on delete set null;

drop policy if exists po_del on public.purchase_orders;
create policy po_del on public.purchase_orders for delete to authenticated
  using (
    public.auth_role() in ('admin','founder')
    or (
      public.auth_role() = 'team_lead' and status = 'draft'
      and revision_no = 0 and superseded_by is null
      and not exists (select 1 from public.purchase_orders c where c.root_po_id = purchase_orders.id)
    )
  );
