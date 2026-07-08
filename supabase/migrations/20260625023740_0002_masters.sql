-- ============================================================
-- 0002 — Master data
-- ============================================================

-- ---- categories (self-referencing tree) --------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  parent_id   uuid references public.categories(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  created_by  uuid references public.profiles(id)
);
alter table public.categories enable row level security;
create trigger trg_categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

-- ---- products (SKU templates, e.g. Triton 12K) -------------
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  sku_code      text not null unique,
  model_name    text not null,
  category_id   uuid references public.categories(id),
  description   text,
  is_serialized boolean not null default false,
  base_image    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  created_by    uuid references public.profiles(id)
);
alter table public.products enable row level security;
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

-- ---- product_variant_params (the founder's "dropdowns") ----
create table public.product_variant_params (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  name        text not null,
  input_type  public.input_type not null default 'dropdown',
  options     jsonb,
  min_value   numeric,
  max_value   numeric,
  uom         text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  created_by  uuid references public.profiles(id),
  unique (product_id, name)
);
alter table public.product_variant_params enable row level security;
create trigger trg_pvp_updated before update on public.product_variant_params
  for each row execute function public.set_updated_at();
create index idx_pvp_product on public.product_variant_params(product_id);

-- ---- components (the "component numbers") ------------------
create table public.components (
  id            uuid primary key default gen_random_uuid(),
  component_no  text not null unique,
  name          text not null,
  description   text,
  uom           text,
  type          text,
  is_serialized boolean not null default false,
  reorder_level numeric,
  standard_cost numeric,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  created_by    uuid references public.profiles(id)
);
alter table public.components enable row level security;
create trigger trg_components_updated before update on public.components
  for each row execute function public.set_updated_at();

-- ---- bom_templates (one active per product) ----------------
create table public.bom_templates (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  version    int not null default 1,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid references public.profiles(id),
  unique (product_id, version)
);
alter table public.bom_templates enable row level security;
create trigger trg_bom_templates_updated before update on public.bom_templates
  for each row execute function public.set_updated_at();
-- at most one active template per product
create unique index uniq_active_bom_template on public.bom_templates(product_id) where is_active;

-- ---- bom_template_lines (yellow=common vs variant-driven) --
create table public.bom_template_lines (
  id                uuid primary key default gen_random_uuid(),
  bom_template_id   uuid not null references public.bom_templates(id) on delete cascade,
  component_id      uuid references public.components(id),
  quantity          numeric not null default 0,
  is_common         boolean not null default true,
  is_variant_driven boolean not null default false,
  variant_rule      jsonb,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  created_by        uuid references public.profiles(id)
);
alter table public.bom_template_lines enable row level security;
create trigger trg_btl_updated before update on public.bom_template_lines
  for each row execute function public.set_updated_at();
create index idx_btl_template on public.bom_template_lines(bom_template_id);
create index idx_btl_component on public.bom_template_lines(component_id);

-- ---- vendors -----------------------------------------------
create table public.vendors (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  gst_no             text,
  contact            text,
  address            text,
  avg_lead_time_days int,
  rating             numeric,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,
  created_by         uuid references public.profiles(id)
);
alter table public.vendors enable row level security;
create trigger trg_vendors_updated before update on public.vendors
  for each row execute function public.set_updated_at();

-- ---- vendor_components (who supplies what) -----------------
create table public.vendor_components (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references public.vendors(id) on delete cascade,
  component_id    uuid not null references public.components(id) on delete cascade,
  vendor_part_code text,
  price           numeric,
  lead_time_days  int,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  created_by      uuid references public.profiles(id),
  unique (vendor_id, component_id)
);
alter table public.vendor_components enable row level security;
create trigger trg_vendor_components_updated before update on public.vendor_components
  for each row execute function public.set_updated_at();
create index idx_vc_vendor on public.vendor_components(vendor_id);
create index idx_vc_component on public.vendor_components(component_id);
