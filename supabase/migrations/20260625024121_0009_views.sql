-- ============================================================
-- 0009 — Derived views: Action Center + KPIs + column-masked safe views
-- All views use security_invoker so underlying-table RLS applies to the caller.
-- ============================================================

-- ---- on-hand per component (with value) --------------------
create view public.v_component_on_hand with (security_invoker = true) as
select c.id as component_id, c.component_no, c.name, c.uom,
       coalesce(sum(l.qty_on_hand), 0)                  as qty_on_hand,
       coalesce(sum(l.qty_on_hand * l.unit_cost), 0)    as stock_value,
       count(l.id) filter (where l.status <> 'consumed') as lot_count
from public.components c
left join public.inventory_lots l
       on l.component_id = c.id and l.status <> 'consumed'
group by c.id, c.component_no, c.name, c.uom;

-- ---- per-project consumption value (internal costing) ------
create view public.v_project_consumption with (security_invoker = true) as
select m.project_id, m.component_id,
       sum(-m.qty)                  as consumed_qty,
       sum(-m.qty * l.unit_cost)    as consumption_value
from public.stock_movements m
join public.inventory_lots l on l.id = m.lot_id
where m.movement_type = 'issue' and m.project_id is not null
group by m.project_id, m.component_id;

-- ---- BOM vs Ordered vs Received variance -------------------
create view public.v_bom_variance with (security_invoker = true) as
with req as (
  select b.project_id, bl.component_id, sum(bl.required_qty) as required_qty
  from public.boms b join public.bom_lines bl on bl.bom_id = b.id
  where bl.component_id is not null
  group by b.project_id, bl.component_id),
ord as (
  select pl.project_id, pl.component_id, sum(pl.qty_ordered) as ordered_qty
  from public.po_lines pl
  where pl.project_id is not null and pl.component_id is not null
  group by pl.project_id, pl.component_id),
rcv as (
  select gl.project_id, gl.component_id, sum(gl.qty_received) as received_qty
  from public.grn_lines gl
  where gl.project_id is not null and gl.component_id is not null
  group by gl.project_id, gl.component_id),
keys as (
  select project_id, component_id from req
  union select project_id, component_id from ord
  union select project_id, component_id from rcv)
select k.project_id, k.component_id,
       coalesce(req.required_qty, 0) as required_qty,
       coalesce(ord.ordered_qty, 0)  as ordered_qty,
       coalesce(rcv.received_qty, 0)  as received_qty,
       coalesce(req.required_qty,0) - coalesce(ord.ordered_qty,0) as order_gap,      -- >0 = under-ordered
       coalesce(ord.ordered_qty,0)  - coalesce(rcv.received_qty,0) as receive_gap    -- >0 = awaiting receipt
from keys k
left join req on req.project_id = k.project_id and req.component_id = k.component_id
left join ord on ord.project_id = k.project_id and ord.component_id = k.component_id
left join rcv on rcv.project_id = k.project_id and rcv.component_id = k.component_id;

-- ---- untagged receipts (received with no PO) ---------------
create view public.v_untagged_receipts with (security_invoker = true) as
select gl.id as grn_line_id, gl.grn_id, g.grn_no, g.challan_no, g.received_at,
       gl.component_id, c.component_no, c.name as component_name,
       gl.qty_received, gl.unit_cost, g.vendor_id, v.name as vendor_name
from public.grn_lines gl
join public.grns g on g.id = gl.grn_id
left join public.components c on c.id = gl.component_id
left join public.vendors v on v.id = g.vendor_id
where gl.is_untagged = true;

-- ---- missing PO: BOM demand not yet ordered ----------------
create view public.v_missing_po with (security_invoker = true) as
select bv.project_id, bv.component_id, c.component_no, c.name as component_name,
       bv.required_qty, bv.ordered_qty, bv.received_qty, bv.order_gap
from public.v_bom_variance bv
left join public.components c on c.id = bv.component_id
where bv.ordered_qty = 0 and bv.required_qty > bv.received_qty;

-- ---- stale stock: available lots older than 60 days --------
create view public.v_stale_stock with (security_invoker = true) as
select l.id as lot_id, l.lot_code, l.component_id, c.component_no, c.name as component_name,
       l.qty_on_hand, l.unit_cost, l.created_at,
       (current_date - l.created_at::date) as age_days
from public.inventory_lots l
left join public.components c on c.id = l.component_id
where l.status = 'available' and l.qty_on_hand > 0
  and l.created_at < now() - interval '60 days';

-- ---- PO overdue: open lines past expected date -------------
create view public.v_po_overdue with (security_invoker = true) as
select pl.id as po_line_id, pl.po_id, po.po_no, po.vendor_id, v.name as vendor_name,
       pl.component_id, c.component_no, c.name as component_name,
       pl.qty_ordered, pl.qty_received, pl.expected_date,
       (current_date - pl.expected_date) as days_overdue
from public.po_lines pl
join public.purchase_orders po on po.id = pl.po_id
left join public.vendors v on v.id = po.vendor_id
left join public.components c on c.id = pl.component_id
where pl.line_status in ('pending','partial')
  and pl.expected_date is not null and pl.expected_date < current_date;

-- ---- invoice vs PO cross-check -----------------------------
create view public.v_invoice_vs_po with (security_invoker = true) as
select po.id as po_id, po.po_no, po.vendor_id, v.name as vendor_name,
       po.total_amount, po.invoice_no, po.invoice_status,
       coalesce(sum(pl.amount), 0) as lines_amount,
       (po.total_amount - coalesce(sum(pl.amount), 0)) as amount_diff
from public.purchase_orders po
left join public.po_lines pl on pl.po_id = po.id
left join public.vendors v on v.id = po.vendor_id
group by po.id, po.po_no, po.vendor_id, v.name, po.total_amount, po.invoice_no, po.invoice_status;

-- ---- supplier KPI scaffold (on-time refined in M5) ---------
create view public.v_supplier_kpi with (security_invoker = true) as
select v.id as vendor_id, v.name, v.avg_lead_time_days, v.rating,
       count(distinct po.id)                                          as total_pos,
       count(distinct po.id) filter (where po.status = 'completed')   as completed_pos,
       count(distinct po.id) filter (where po.status in ('draft','sent','partial')) as open_pos,
       count(pl.id)                                                   as total_lines,
       count(pl.id) filter (where pl.line_status = 'received')        as received_lines
from public.vendors v
left join public.purchase_orders po on po.vendor_id = v.id
left join public.po_lines pl on pl.po_id = po.id
group by v.id, v.name, v.avg_lead_time_days, v.rating;

-- ============================================================
-- Column-masked "safe" views for team_member (financials hidden)
-- ============================================================
create view public.v_components_safe with (security_invoker = true) as
select id, component_no, name, description, uom, type, is_serialized, reorder_level,
       created_at, updated_at, created_by
from public.components;

create view public.v_vendor_components_safe with (security_invoker = true) as
select id, vendor_id, component_id, vendor_part_code, lead_time_days,
       created_at, updated_at, created_by
from public.vendor_components;

create view public.v_purchase_orders_safe with (security_invoker = true) as
select id, po_no, vendor_id, po_date, status, is_informal, source, invoice_no, invoice_status,
       created_at, updated_at, created_by
from public.purchase_orders;

create view public.v_po_lines_safe with (security_invoker = true) as
select id, po_id, component_id, project_id, requisition_line_id, qty_ordered, qty_received,
       line_status, expected_date, created_at, updated_at, created_by
from public.po_lines;

create view public.v_projects_safe with (security_invoker = true) as
select id, project_no, customer_id, customer_po_number, order_date, status,
       delivery_date, dispatch_date, team_id, created_at, updated_at, created_by
from public.projects;

create view public.v_inventory_lots_safe with (security_invoker = true) as
select id, lot_code, component_id, grn_line_id, vendor_id, project_id, qty_on_hand, qty_initial,
       location, is_serialized, status, created_at, updated_at, created_by
from public.inventory_lots;

create view public.v_grn_lines_safe with (security_invoker = true) as
select id, grn_id, component_id, qty_received, po_line_id, project_id, is_untagged,
       created_at, updated_at, created_by
from public.grn_lines;

create view public.v_component_on_hand_safe with (security_invoker = true) as
select component_id, component_no, name, uom, qty_on_hand, lot_count
from public.v_component_on_hand;
