-- ============================================================
-- 0023 — Component → parent sub-assembly link (dropdown on the components master)
-- ============================================================
alter table public.components
  add column parent_assembly_id uuid references public.components(id);
create index idx_components_parent_assembly on public.components(parent_assembly_id);

-- expose on the column-masked safe view (non-financial)
drop view if exists public.v_components_safe;
create view public.v_components_safe
with (security_invoker = true) as
select
  id, component_no, name, description, uom, type, quantity_type, tracking_mode,
  is_serialized, is_assembly, parent_assembly_id, is_job_work, raw_supplier_id, jw_vendor_id,
  grade, spec, od_mm, id_mm, thk_mm, width_mm, length_mm, nominal_size,
  by_weight, weight_uom, cut_from_plate, original_description,
  reorder_level, created_at, updated_at, created_by
from public.components;
grant select on public.v_components_safe to authenticated;

-- backfill from the imported BOM tree: component-bearing child lines
update public.components c
set parent_assembly_id = pc.id
from public.bom_template_lines l
join public.bom_template_lines p on p.id = l.parent_line_id
join public.components pc on pc.id = p.component_id and pc.is_assembly
where l.component_id = c.id;

-- backfill variant components (referenced inside variant_rule.map, not via component_id)
update public.components c
set parent_assembly_id = pc.id
from public.bom_template_lines l
join public.bom_template_lines p on p.id = l.parent_line_id
join public.components pc on pc.id = p.component_id and pc.is_assembly
join lateral jsonb_path_query(l.variant_rule->'map', '$.*.component_no') as vc on true
where l.is_variant_driven
  and lower(c.component_no) = lower(vc #>> '{}');
