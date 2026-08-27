-- v_component_on_hand previously joined inventory_lots with "and l.status <> 'consumed'"
-- in the ON clause, so a component whose only lots were fully consumed produced zero
-- joined rows and vanished from the Inventory list entirely. Consumed lots always have
-- qty_on_hand = 0 (verified against production data), so joining unconditionally does
-- not change qty_on_hand/stock_value — it only lets has_stock_history distinguish
-- "purchased and fully consumed" (should still show, at qty 0) from "never purchased"
-- (should stay hidden).

create or replace view public.v_component_on_hand with (security_invoker = true) as
select c.id as component_id, c.component_no, c.name, c.uom,
       coalesce(sum(l.qty_on_hand), 0)                                       as qty_on_hand,
       coalesce(sum(l.qty_on_hand * coalesce(pl.rate, l.unit_cost)), 0)      as stock_value,
       count(l.id) filter (where l.status <> 'consumed')                    as lot_count,
       count(l.id) > 0                                                      as has_stock_history
from public.components c
left join public.inventory_lots l
       on l.component_id = c.id
left join public.grn_lines gl
       on gl.id = l.grn_line_id
left join public.po_lines pl
       on pl.id = gl.po_line_id and pl.approval_status = 'approved'
group by c.id, c.component_no, c.name, c.uom;

create or replace view public.v_component_on_hand_safe with (security_invoker = true) as
select component_id, component_no, name, uom, qty_on_hand, lot_count, has_stock_history
from public.v_component_on_hand;
