drop view if exists public.v_po_overdue;
create view public.v_po_overdue with (security_invoker = true) as
select pl.id as po_line_id, pl.po_id, po.po_no, po.vendor_id, v.name as vendor_name,
       pl.component_id, c.component_no, c.name as component_name,
       pl.project_id, p.project_no,
       pl.qty_ordered, pl.qty_received, pl.expected_date,
       (current_date - pl.expected_date) as days_overdue
from public.po_lines pl
join public.purchase_orders po on po.id = pl.po_id
left join public.vendors v on v.id = po.vendor_id
left join public.components c on c.id = pl.component_id
left join public.projects p on p.id = pl.project_id
where pl.line_status in ('pending','partial')
  and pl.expected_date is not null and pl.expected_date < current_date;
