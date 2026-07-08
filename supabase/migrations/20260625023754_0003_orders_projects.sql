-- ============================================================
-- 0003 — Customers / Projects / Documents
-- ============================================================

create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  contact    text,
  address    text,
  gst_no     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid references public.profiles(id)
);
alter table public.customers enable row level security;
create trigger trg_customers_updated before update on public.customers
  for each row execute function public.set_updated_at();

create table public.projects (
  id                uuid primary key default gen_random_uuid(),
  project_no        text not null unique,
  customer_id       uuid references public.customers(id),
  customer_po_number text,
  customer_po_value numeric,
  order_date        date,
  status            public.project_status not null default 'planning',
  delivery_date     date,
  dispatch_date     date,
  team_id           uuid references public.teams(id),   -- RLS scoping
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  created_by        uuid references public.profiles(id)
);
alter table public.projects enable row level security;
create trigger trg_projects_updated before update on public.projects
  for each row execute function public.set_updated_at();
create index idx_projects_team on public.projects(team_id);
create index idx_projects_customer on public.projects(customer_id);

create table public.project_line_items (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  product_id         uuid references public.products(id),
  variant_selections jsonb,
  quantity           int not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,
  created_by         uuid references public.profiles(id)
);
alter table public.project_line_items enable row level security;
create trigger trg_pli_updated before update on public.project_line_items
  for each row execute function public.set_updated_at();
create index idx_pli_project on public.project_line_items(project_id);

create table public.project_documents (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  doc_type    public.doc_type not null default 'other',
  file_path   text,
  status      public.doc_status not null default 'pending',
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  created_by  uuid references public.profiles(id)
);
alter table public.project_documents enable row level security;
create trigger trg_project_documents_updated before update on public.project_documents
  for each row execute function public.set_updated_at();
create index idx_project_documents_project on public.project_documents(project_id);
