-- ============================================================
-- 0062 — Derive component/inventory value from the approved PO rate,
-- not the amount typed at GRN time.
--
-- Business rule: a component's value is what its Purchase Order was
-- raised for. The "Unit cost" typed on the GRN screen is a manual
-- comparison figure only — it never drove costing logic before this
-- migration either (it just copied onto the lot), but v_component_on_hand
-- and v_project_consumption were reading it as if it were the cost basis.
-- They now prefer the rate on the approved po_line the receipt was
-- tagged against, and only fall back to the lot's own unit_cost for
-- receipts that were never tied to a PO (untagged GRNs, site purchases,
-- job-work output lots) — those have no PO rate to derive from.
--
-- "Only if a QR has been generated" is automatic: both views only ever
-- sum over rows in inventory_lots, and a lot row is exactly what a QR
-- code (lot_code) is generated for.
-- ============================================================

create or replace view public.v_component_on_hand with (security_invoker = true) as
select c.id as component_id, c.component_no, c.name, c.uom,
       coalesce(sum(l.qty_on_hand), 0)                                       as qty_on_hand,
       coalesce(sum(l.qty_on_hand * coalesce(pl.rate, l.unit_cost)), 0)      as stock_value,
       count(l.id) filter (where l.status <> 'consumed')                    as lot_count
from public.components c
left join public.inventory_lots l
       on l.component_id = c.id and l.status <> 'consumed'
left join public.grn_lines gl
       on gl.id = l.grn_line_id
left join public.po_lines pl
       on pl.id = gl.po_line_id and pl.approval_status = 'approved'
group by c.id, c.component_no, c.name, c.uom;

create or replace view public.v_project_consumption with (security_invoker = true) as
select m.project_id, m.component_id,
       sum(-m.qty)                                          as consumed_qty,
       sum(-m.qty * coalesce(pl.rate, l.unit_cost))          as consumption_value
from public.stock_movements m
join public.inventory_lots l on l.id = m.lot_id
left join public.grn_lines gl on gl.id = l.grn_line_id
left join public.po_lines pl on pl.id = gl.po_line_id and pl.approval_status = 'approved'
where m.movement_type = 'issue' and m.project_id is not null
group by m.project_id, m.component_id;
