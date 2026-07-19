-- ============================================================
-- 0024 — BOM templates can belong to a product OR a sub-assembly component
-- ============================================================
alter table public.bom_templates alter column product_id drop not null;
alter table public.bom_templates add column component_id uuid references public.components(id);

-- exactly one owner: a product template OR a sub-assembly template
alter table public.bom_templates
  add constraint bom_template_owner_ck check (num_nonnulls(product_id, component_id) = 1);

-- one active template + unique versions per sub-assembly component
create unique index uniq_active_bom_template_component
  on public.bom_templates(component_id) where is_active and component_id is not null;
create unique index uniq_bom_template_component_version
  on public.bom_templates(component_id, version) where component_id is not null;
