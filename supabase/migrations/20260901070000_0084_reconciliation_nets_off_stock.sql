-- ============================================================
-- 0084 — "Missing PO" / "BOM variance" stop flagging demand that
--         is already covered by consumption or on-hand stock.
--
-- v_bom_variance / v_missing_po compared BOM demand against PO lines
-- and receipts *tagged to the same project* only. Demand met another
-- way — consumed from general/untagged stock, a site purchase, or a
-- requisition drawing down open stock — left ordered_qty = 0, so the
-- Action Center kept nagging "no PO raised" even though the material
-- was physically on the job (and often already consumed). The
-- project's own Shortfall panel (v_project_shortfall) already nets
-- these off; this aligns the reconciliation views with it.
--
-- Rebuilt on top of the live definition (which already includes the
-- 20260818 "bom_variance_include_blocked_stock" change: cancelled PO
-- lines excluded from `ord`; project-reserved lots with no grn_line
-- counted in `rcv`). Adds three trailing columns to v_bom_variance
-- (CREATE OR REPLACE, so the dependent v_missing_po is untouched):
--   consumed_qty  — genuinely consumed for this project (issue
--                   movements, excluding job-work dispatch); mirrors
--                   project_shortfall()'s definition
--   on_hand_qty   — coverable stock: general/untagged lots + this
--                   project's own open lots (other projects' reserved
--                   stock excluded); mirrors project_shortfall()
--   uncovered_qty — greatest(required - ordered - consumed - on_hand, 0)
--                   = demand that genuinely still needs a PO
--
-- v_missing_po now filters on uncovered_qty > 0 (instead of
-- required_qty > received_qty) and exposes the three new columns.
--
-- NOTE: on_hand_qty is credited to every project needing the
-- component (a flat view can't run project_shortfall()'s working-pool
-- walk), so shared stock can be over-credited. That errs toward NOT
-- raising a false alarm, which is the intent; the project page's
-- recursive v_project_shortfall stays the precise source of truth.
-- ============================================================

create or replace view public.v_bom_variance with (security_invoker = true) as
with req as (
  select b.project_id, bl.component_id, sum(bl.required_qty) as required_qty
  from public.boms b
  join public.bom_lines bl on bl.bom_id = b.id
  where bl.component_id is not null
  group by b.project_id, bl.component_id
),
ord as (
  select pl.project_id, pl.component_id, sum(pl.qty_ordered) as ordered_qty
  from public.po_lines pl
  where pl.project_id is not null and pl.component_id is not null
    and pl.line_status <> 'cancelled'::po_line_status
  group by pl.project_id, pl.component_id
),
rcv as (
  select src.project_id, src.component_id, sum(src.qty) as received_qty
  from (
    select gl.project_id, gl.component_id, gl.qty_received as qty
    from public.grn_lines gl
    where gl.project_id is not null and gl.component_id is not null
    union all
    select l.project_id, l.component_id, l.qty_initial as qty
    from public.inventory_lots l
    where l.project_id is not null and l.component_id is not null
      and l.grn_line_id is null
      and l.status = any (array['issued'::lot_status, 'consumed'::lot_status])
  ) src
  group by src.project_id, src.component_id
),
csm as (
  select sm.project_id, sm.component_id, sum(-sm.qty) as consumed_qty
  from public.stock_movements sm
  where sm.movement_type = 'issue' and sm.project_id is not null and sm.component_id is not null
    and sm.reference_type is distinct from 'job_work'
  group by sm.project_id, sm.component_id
),
oh as (
  select il.project_id, il.component_id, sum(il.qty_on_hand) as qty
  from public.inventory_lots il
  where il.status <> 'consumed' and il.qty_on_hand > 0 and il.component_id is not null
  group by il.project_id, il.component_id
),
keys as (
  select project_id, component_id from req
  union select project_id, component_id from ord
  union select project_id, component_id from rcv
  union select project_id, component_id from csm
),
ohk as (
  select k.project_id, k.component_id, coalesce(sum(o.qty), 0) as on_hand_qty
  from keys k
  left join oh o on o.component_id = k.component_id
                and (o.project_id is null or o.project_id = k.project_id)
  group by k.project_id, k.component_id
)
select k.project_id,
       k.component_id,
       coalesce(req.required_qty, 0) as required_qty,
       coalesce(ord.ordered_qty, 0)  as ordered_qty,
       coalesce(rcv.received_qty, 0)  as received_qty,
       coalesce(req.required_qty, 0) - coalesce(ord.ordered_qty, 0) as order_gap,     -- >0 = under-ordered
       coalesce(ord.ordered_qty, 0)  - coalesce(rcv.received_qty, 0) as receive_gap,  -- >0 = awaiting receipt
       coalesce(csm.consumed_qty, 0) as consumed_qty,
       coalesce(ohk.on_hand_qty, 0)  as on_hand_qty,
       greatest(
         coalesce(req.required_qty, 0)
         - coalesce(ord.ordered_qty, 0)
         - coalesce(csm.consumed_qty, 0)
         - coalesce(ohk.on_hand_qty, 0),
       0) as uncovered_qty                                                            -- >0 = genuinely still needs a PO
from keys k
left join req on req.project_id = k.project_id and req.component_id = k.component_id
left join ord on ord.project_id = k.project_id and ord.component_id = k.component_id
left join rcv on rcv.project_id = k.project_id and rcv.component_id = k.component_id
left join csm on csm.project_id = k.project_id and csm.component_id = k.component_id
left join ohk on ohk.project_id = k.project_id and ohk.component_id = k.component_id;

grant select on public.v_bom_variance to authenticated;

-- ---- missing PO: BOM demand with nothing ordered AND not covered by stock ----
create or replace view public.v_missing_po with (security_invoker = true) as
select bv.project_id, bv.component_id, c.component_no, c.name as component_name,
       bv.required_qty, bv.ordered_qty, bv.received_qty, bv.order_gap,
       bv.consumed_qty, bv.on_hand_qty, bv.uncovered_qty
from public.v_bom_variance bv
left join public.components c on c.id = bv.component_id
where bv.ordered_qty = 0 and bv.uncovered_qty > 0;

grant select on public.v_missing_po to authenticated;
