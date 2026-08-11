-- ============================================================
-- 0042 — PO line price approval: schema
-- Adds an approval_status gate on po_lines.rate, mirroring the shape of
-- the IRN inspection-approval module (irn_status enum + audit columns +
-- CHECK constraint). Behavior (who is gated, who approves, what "last
-- approved rate" means) is implemented by a trigger in the next migration
-- — this one is pure schema.
-- ============================================================

create type public.po_line_approval_status as enum ('pending_approval','approved','rejected');

alter table public.po_lines
  add column approval_status public.po_line_approval_status not null default 'approved',
  add column approved_by    uuid references public.profiles(id),
  add column approved_at    timestamptz,
  add column rejection_reason text;

-- Existing rows: left as 'approved' with no approver stamped. 'approved'
-- with a null approved_by means "no specific human decision" throughout
-- this design (auto-approved by price comparison, or historical/backfilled
-- data) — not an error state, so no backfill of approved_by/approved_at
-- is needed here.
alter table public.po_lines add constraint chk_po_line_approval_fields check (
  (approval_status = 'pending_approval' and approved_by is null and approved_at is null and rejection_reason is null)
  or (approval_status = 'approved' and rejection_reason is null)
  or (approval_status = 'rejected' and approved_by is not null and approved_at is not null)
);

create index idx_po_lines_approval_status on public.po_lines(approval_status)
  where approval_status <> 'approved';

-- "Last approved rate" for a component, matched across any vendor — used by
-- the UI to prefill the Rate field on a new PO line. (The gate trigger does
-- its own inline query rather than selecting from this view.)
create view public.v_last_component_rate
with (security_invoker = true) as
select distinct on (component_id) component_id, rate
from public.po_lines
where rate is not null and approval_status = 'approved'
order by component_id, coalesce(approved_at, created_at) desc;
grant select on public.v_last_component_rate to authenticated;
