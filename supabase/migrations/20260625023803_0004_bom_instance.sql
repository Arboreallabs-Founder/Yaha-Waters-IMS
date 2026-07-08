-- ============================================================
-- 0004 — BOM instance (per project)
-- ============================================================

create table public.boms (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  status      public.bom_status not null default 'draft',
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  created_by  uuid references public.profiles(id)
);
alter table public.boms enable row level security;
create trigger trg_boms_updated before update on public.boms
  for each row execute function public.set_updated_at();
create index idx_boms_project on public.boms(project_id);

create table public.bom_lines (
  id                   uuid primary key default gen_random_uuid(),
  bom_id               uuid not null references public.boms(id) on delete cascade,
  project_line_item_id uuid references public.project_line_items(id) on delete set null,
  component_id         uuid references public.components(id),
  required_qty         numeric not null default 0,
  source               public.bom_line_source not null default 'template',
  note                 text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz,
  created_by           uuid references public.profiles(id)
);
alter table public.bom_lines enable row level security;
create trigger trg_bom_lines_updated before update on public.bom_lines
  for each row execute function public.set_updated_at();
create index idx_bom_lines_bom on public.bom_lines(bom_id);
create index idx_bom_lines_component on public.bom_lines(component_id);
