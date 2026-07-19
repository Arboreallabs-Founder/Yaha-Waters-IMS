-- ============================================================
-- 0018 — Component attributes, kind (assembly), Job Work, tracking mode
-- ============================================================

-- how a component's stock is QR-tracked
create type public.tracking_mode as enum ('item', 'box', 'bulk');

alter table public.components
  -- physical attributes (from the annotated BOM sheet)
  add column grade                text,
  add column spec                 text,
  add column od_mm                numeric,
  add column id_mm                numeric,
  add column thk_mm               numeric,
  add column width_mm             numeric,
  add column length_mm            numeric,
  add column nominal_size         text,          -- text: values like '1/4" x 1/4"'
  add column by_weight            boolean not null default false,
  add column weight_uom           text,
  add column cut_from_plate       boolean not null default false,
  add column original_description text,
  -- kind: an assembly is a stockable sub-BOM (has child template lines)
  add column is_assembly          boolean not null default false,
  -- job work: raw form bought from raw_supplier, finished by jw_vendor; cost = raw + jw_rate
  add column is_job_work          boolean not null default false,
  add column raw_supplier_id      uuid references public.vendors(id),
  add column jw_vendor_id         uuid references public.vendors(id),
  add column jw_rate              numeric,
  -- QR tracking granularity (item = per piece, box = per container, bulk = measured)
  add column tracking_mode        public.tracking_mode not null default 'box';

create index idx_components_raw_supplier on public.components(raw_supplier_id);
create index idx_components_jw_vendor    on public.components(jw_vendor_id);

-- Rebuild the column-masked safe view: expose new attributes, still hide the
-- financial columns (standard_cost, jw_rate) from team_member.
drop view if exists public.v_components_safe;
create view public.v_components_safe
with (security_invoker = true) as
select
  id, component_no, name, description, uom, type, quantity_type, tracking_mode,
  is_serialized, is_assembly, is_job_work, raw_supplier_id, jw_vendor_id,
  grade, spec, od_mm, id_mm, thk_mm, width_mm, length_mm, nominal_size,
  by_weight, weight_uom, cut_from_plate, original_description,
  reorder_level, created_at, updated_at, created_by
from public.components;

grant select on public.v_components_safe to authenticated;
