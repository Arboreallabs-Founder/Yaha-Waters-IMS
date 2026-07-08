-- ============================================================
-- 0005 — Demand / Procurement
-- ============================================================

create table public.requisitions (
  id           uuid primary key default gen_random_uuid(),
  req_no       text not null unique,
  project_id   uuid references public.projects(id),   -- nullable = stock
  status       public.req_status not null default 'open',
  requested_by uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  created_by   uuid references public.profiles(id)
);
alter table public.requisitions enable row level security;
create trigger trg_requisitions_updated before update on public.requisitions
  for each row execute function public.set_updated_at();
create index idx_requisitions_project on public.requisitions(project_id);

create table public.requisition_lines (
  id              uuid primary key default gen_random_uuid(),
  requisition_id  uuid not null references public.requisitions(id) on delete cascade,
  component_id    uuid references public.components(id),
  qty             numeric not null default 0,
  bom_line_id     uuid references public.bom_lines(id),
  shortfall_qty   numeric,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  created_by      uuid references public.profiles(id)
);
alter table public.requisition_lines enable row level security;
create trigger trg_requisition_lines_updated before update on public.requisition_lines
  for each row execute function public.set_updated_at();
create index idx_reqlines_req on public.requisition_lines(requisition_id);
create index idx_reqlines_component on public.requisition_lines(component_id);

create table public.purchase_orders (
  id             uuid primary key default gen_random_uuid(),
  po_no          text not null unique,
  vendor_id      uuid references public.vendors(id),
  po_date        date,
  status         public.po_status not null default 'draft',
  is_informal    boolean not null default false,
  source         public.po_source not null default 'system',
  total_amount   numeric,
  invoice_no     text,
  invoice_status text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  created_by     uuid references public.profiles(id)
);
alter table public.purchase_orders enable row level security;
create trigger trg_purchase_orders_updated before update on public.purchase_orders
  for each row execute function public.set_updated_at();
create index idx_po_vendor on public.purchase_orders(vendor_id);

create table public.po_lines (
  id                  uuid primary key default gen_random_uuid(),
  po_id               uuid not null references public.purchase_orders(id) on delete cascade,
  component_id        uuid references public.components(id),
  project_id          uuid references public.projects(id),          -- nullable, back-fillable
  requisition_line_id uuid references public.requisition_lines(id),
  qty_ordered         numeric not null default 0,
  rate                numeric,
  amount              numeric,
  qty_received        numeric not null default 0,                  -- trigger-maintained
  line_status         public.po_line_status not null default 'pending',
  expected_date       date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,
  created_by          uuid references public.profiles(id)
);
alter table public.po_lines enable row level security;
create trigger trg_po_lines_updated before update on public.po_lines
  for each row execute function public.set_updated_at();
create index idx_po_lines_po on public.po_lines(po_id);
create index idx_po_lines_component on public.po_lines(component_id);
create index idx_po_lines_project on public.po_lines(project_id);
