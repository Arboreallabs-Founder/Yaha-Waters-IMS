-- Average delivery time per component, for the Inventory page.
--
-- One delivery = one fully signed GRN that received the component against a
-- PO. Its time is the days from the original PO's date (the first revision —
-- a revision doesn't restart the clock) to the day the GRN was received
-- (India time). Several lines of the same component on one GRN count once.
-- Job-work returns aren't purchases and are left out, as are the few GRNs
-- dated before their PO (backfilled data).
create or replace view public.v_component_delivery_days
with (security_invoker = true) as
with d as (
  select distinct pl.component_id, g.id as grn_id, root.id as root_po_id,
         ((g.received_at at time zone 'Asia/Kolkata')::date - root.po_date) as days
    from public.grn_lines l
    join public.grns g on g.id = l.grn_id
    join public.po_lines pl on pl.id = l.po_line_id
    join public.purchase_orders po on po.id = pl.po_id
    join public.purchase_orders root on root.id = coalesce(po.root_po_id, po.id)
   where l.processed_at is not null and l.jw_line_id is null
)
select component_id,
       round(avg(days), 1)::numeric as avg_days,
       count(*)::int as deliveries
  from d
 where days is not null and days >= 0
 group by component_id;

grant select on public.v_component_delivery_days to authenticated;
