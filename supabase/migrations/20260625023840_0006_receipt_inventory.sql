-- ============================================================
-- 0006 — Goods receipt / Inventory / Ledger
-- ============================================================

create table public.grns (
  id          uuid primary key default gen_random_uuid(),
  grn_no      text not null unique,
  vendor_id   uuid references public.vendors(id),
  challan_no  text,
  po_id       uuid references public.purchase_orders(id),
  received_by uuid references public.profiles(id),
  received_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  created_by  uuid references public.profiles(id)
);
alter table public.grns enable row level security;
create trigger trg_grns_updated before update on public.grns
  for each row execute function public.set_updated_at();
create index idx_grns_po on public.grns(po_id);

create table public.grn_lines (
  id           uuid primary key default gen_random_uuid(),
  grn_id       uuid not null references public.grns(id) on delete cascade,
  component_id uuid references public.components(id),
  qty_received numeric not null default 0,
  po_line_id   uuid references public.po_lines(id),     -- nullable = received with no PO
  project_id   uuid references public.projects(id),     -- nullable
  unit_cost    numeric,
  is_untagged  boolean not null default false,          -- received on no PO
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  created_by   uuid references public.profiles(id)
);
alter table public.grn_lines enable row level security;
create trigger trg_grn_lines_updated before update on public.grn_lines
  for each row execute function public.set_updated_at();
create index idx_grn_lines_grn on public.grn_lines(grn_id);
create index idx_grn_lines_po_line on public.grn_lines(po_line_id);
create index idx_grn_lines_component on public.grn_lines(component_id);

-- inventory_lots: lot_code is the QR payload; qty_on_hand trigger-maintained from ledger
create table public.inventory_lots (
  id            uuid primary key default gen_random_uuid(),
  lot_code      text not null unique,
  component_id  uuid references public.components(id),
  grn_line_id   uuid references public.grn_lines(id),
  vendor_id     uuid references public.vendors(id),
  project_id    uuid references public.projects(id),
  qty_on_hand   numeric not null default 0,            -- trigger-maintained
  qty_initial   numeric not null default 0,
  unit_cost     numeric,
  location      text,
  is_serialized boolean not null default false,
  status        public.lot_status not null default 'available',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  created_by    uuid references public.profiles(id)
);
alter table public.inventory_lots enable row level security;
create trigger trg_inventory_lots_updated before update on public.inventory_lots
  for each row execute function public.set_updated_at();
create index idx_lots_component on public.inventory_lots(component_id);
create index idx_lots_project on public.inventory_lots(project_id);
create index idx_lots_status on public.inventory_lots(status);

-- stock_movements: immutable signed ledger, the source of truth for on-hand
create table public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  lot_id         uuid references public.inventory_lots(id),
  component_id   uuid references public.components(id),
  movement_type  public.movement_type not null,
  qty            numeric not null,                     -- signed: receipt/return +, issue -
  project_id     uuid references public.projects(id),  -- consumption tag
  reference_type text,
  reference_id   uuid,
  performed_by   uuid references public.profiles(id),
  performed_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  created_by     uuid references public.profiles(id)
);
alter table public.stock_movements enable row level security;
create index idx_movements_lot on public.stock_movements(lot_id);
create index idx_movements_component on public.stock_movements(component_id);
create index idx_movements_project on public.stock_movements(project_id);

create table public.finished_goods (
  id                   uuid primary key default gen_random_uuid(),
  project_line_item_id uuid references public.project_line_items(id),
  product_id           uuid references public.products(id),
  serial_no            text not null unique,           -- QR
  status               public.fg_status not null default 'in_production',
  variant_selections   jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz,
  created_by           uuid references public.profiles(id)
);
alter table public.finished_goods enable row level security;
create trigger trg_finished_goods_updated before update on public.finished_goods
  for each row execute function public.set_updated_at();
create index idx_fg_project_line on public.finished_goods(project_line_item_id);
