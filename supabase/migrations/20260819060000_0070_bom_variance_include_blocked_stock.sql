-- ============================================================
-- 0070 — v_bom_variance's "Received" only summed grn_lines.qty_received,
-- so material that reached a project via requisition-blocking of
-- existing generic stock (issue_requisition) — or via a site purchase —
-- never counted as received, even though it genuinely arrived. Every
-- lot NOT created by a GRN receipt (grn_line_id is null) but tied to a
-- project (project_id is not null, status in ('issued','consumed')) is
-- exactly that: stock committed to the project outside the PO/GRN
-- pipeline. A project-scoped GRN lot is never 'open' at creation, so it
-- can never be picked up by issue_requisition's FIFO selection — no
-- double-counting risk against the existing grn_lines sum.
-- Pure view redefinition — no table data is touched.
-- ============================================================

create or replace view public.v_bom_variance with (security_invoker = true) as
with req as (
  select b.project_id, bl.component_id, sum(bl.required_qty) as required_qty
  from public.boms b join public.bom_lines bl on bl.bom_id = b.id
  where bl.component_id is not null
  group by b.project_id, bl.component_id),
ord as (
  select pl.project_id, pl.component_id, sum(pl.qty_ordered) as ordered_qty
  from public.po_lines pl
  where pl.project_id is not null and pl.component_id is not null and pl.line_status <> 'cancelled'
  group by pl.project_id, pl.component_id),
rcv as (
  select project_id, component_id, sum(qty) as received_qty
  from (
    select gl.project_id, gl.component_id, gl.qty_received as qty
    from public.grn_lines gl
    where gl.project_id is not null and gl.component_id is not null
    union all
    select l.project_id, l.component_id, l.qty_initial as qty
    from public.inventory_lots l
    where l.project_id is not null and l.component_id is not null
      and l.grn_line_id is null
      and l.status in ('issued','consumed')
  ) src
  group by project_id, component_id),
keys as (
  select project_id, component_id from req
  union select project_id, component_id from ord
  union select project_id, component_id from rcv)
select k.project_id, k.component_id,
       coalesce(req.required_qty, 0) as required_qty,
       coalesce(ord.ordered_qty, 0)  as ordered_qty,
       coalesce(rcv.received_qty, 0)  as received_qty,
       coalesce(req.required_qty,0) - coalesce(ord.ordered_qty,0) as order_gap,
       coalesce(ord.ordered_qty,0)  - coalesce(rcv.received_qty,0) as receive_gap
from keys k
left join req on req.project_id = k.project_id and req.component_id = k.component_id
left join ord on ord.project_id = k.project_id and ord.component_id = k.component_id
left join rcv on rcv.project_id = k.project_id and rcv.component_id = k.component_id;
