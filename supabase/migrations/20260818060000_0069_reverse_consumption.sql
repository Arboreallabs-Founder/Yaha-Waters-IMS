-- Admin-only reversal of a consumption (`issue`) movement back to open stock.
-- Reversal is a compensating `return` movement on the same lot (never a
-- mutation/delete of the original — stock_movements is append-only), which
-- `recompute_lot_on_hand()` picks up automatically to restore qty_on_hand
-- and flip status back to 'open'. This migration:
--   1. Nets `return` reversals against `issue` consumption in
--      v_project_consumption, so the project's "Materials issued" panel and
--      cost cards correctly reflect a reversal (preserving the existing
--      approved-PO-rate valuation logic from migration 0062 unchanged).
--   2. Restricts inserting a `return` movement to admin only (defense in
--      depth alongside the app-layer check in `reverseConsumption`).

create or replace view public.v_project_consumption with (security_invoker = true) as
select
  m.project_id,
  m.component_id,
  sum(-m.qty) as consumed_qty,
  sum((-m.qty) * coalesce(pl.rate, l.unit_cost)) as consumption_value
from stock_movements m
join inventory_lots l on l.id = m.lot_id
left join grn_lines gl on gl.id = l.grn_line_id
left join po_lines pl on pl.id = gl.po_line_id and pl.approval_status = 'approved'::po_line_approval_status
where m.movement_type = any (array['issue'::movement_type, 'return'::movement_type])
  and m.project_id is not null
group by m.project_id, m.component_id;

drop policy if exists mov_ins on public.stock_movements;
create policy mov_ins on public.stock_movements for insert to authenticated
  with check (
    auth_role() = any (array['admin'::role, 'team_lead'::role, 'team_member'::role])
    and (movement_type <> 'return'::movement_type or auth_role() = 'admin'::role)
  );
