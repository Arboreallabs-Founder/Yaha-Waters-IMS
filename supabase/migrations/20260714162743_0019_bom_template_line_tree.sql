-- ============================================================
-- 0019 — BOM template line hierarchy (sections, sub-assemblies, variant meta)
-- ============================================================

alter table public.bom_template_lines
  add column parent_line_id uuid references public.bom_template_lines(id) on delete cascade,
  add column line_type      text,          -- 'assembly' | 'component'
  add column section         text,          -- Housing | SS Brush Frame | Remaining BOM
  add column assembly_name   text,          -- name of the sub-assembly this line belongs to
  add column sort_order      int not null default 0,
  add column variant_group   text,          -- from the sheet (e.g. BR-3600-4-VAR)
  add column variation       text;          -- from the sheet (e.g. '2" - Inlet')

create index idx_btl_parent on public.bom_template_lines(parent_line_id);
