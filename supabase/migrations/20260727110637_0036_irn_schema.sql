-- ============================================================
-- 0036 — IRN (Inspection Release Note) module: schema
-- Inspection Template master (header + fields), a per-component template
-- attachment (item/bulk tracking only — box is excluded, inspecting "the
-- whole box" doesn't map to one IRN), and the IRN header/answers tables.
-- The GRN-time gating mechanics (deferring grn_lines insert until approval)
-- are implemented in the next migration's RPCs — this one is pure schema.
-- ============================================================

create type public.irn_field_type as enum ('text', 'number', 'choice');
create type public.irn_status as enum ('pending_approval', 'approved', 'rejected');

-- ---- Inspection templates (masters) --------------------------
create table public.inspection_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  created_by  uuid references public.profiles(id)
);
alter table public.inspection_templates enable row level security;
create trigger trg_inspection_templates_updated before update on public.inspection_templates
  for each row execute function public.set_updated_at();

create table public.inspection_template_fields (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.inspection_templates(id) on delete cascade,
  label       text not null,
  field_type  public.irn_field_type not null,
  options     jsonb,                    -- required iff field_type='choice'; array of strings
  is_required boolean not null default true,
  is_active   boolean not null default true,   -- soft-delete: never hard-delete once irn_answers reference it
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  created_by  uuid references public.profiles(id),
  constraint chk_itf_options_only_for_choice check (
    (field_type = 'choice' and options is not null and jsonb_typeof(options) = 'array' and jsonb_array_length(options) > 0)
    or (field_type <> 'choice' and options is null)
  )
);
alter table public.inspection_template_fields enable row level security;
create trigger trg_itf_updated before update on public.inspection_template_fields
  for each row execute function public.set_updated_at();
create index idx_itf_template on public.inspection_template_fields(template_id);

-- components: single FK, nullable = no inspection required.
-- Only item/bulk tracking modes may be gated — a "box" represents many
-- pieces sharing one QR, and one IRN's answers can't distinguish them.
alter table public.components
  add column inspection_template_id uuid references public.inspection_templates(id);
alter table public.components
  add constraint chk_components_irn_not_box check (
    inspection_template_id is null or tracking_mode <> 'box'
  );

-- Recreate the column-masked safe view to include the new column.
drop view if exists public.v_components_safe;
create view public.v_components_safe
with (security_invoker = true) as
select
  id, component_no, name, description, uom, type, quantity_type, tracking_mode,
  is_serialized, is_assembly, parent_assembly_id, is_job_work, raw_supplier_id, jw_vendor_id,
  inspection_template_id,
  grade, spec, od_mm, id_mm, thk_mm, width_mm, length_mm, nominal_size,
  by_weight, weight_uom, cut_from_plate, original_description,
  reorder_level, created_at, updated_at, created_by
from public.components;
grant select on public.v_components_safe to authenticated;

-- ---- IRNs (header) --------------------------------------------
create sequence if not exists public.seq_irn_no;
grant usage on sequence public.seq_irn_no to authenticated;

create table public.irns (
  id                uuid primary key default gen_random_uuid(),
  irn_no            text not null unique,
  grn_id            uuid not null references public.grns(id) on delete cascade,
  component_id      uuid not null references public.components(id),
  template_id       uuid not null references public.inspection_templates(id),
  qty               numeric not null,
  unit_cost         numeric,
  po_line_id        uuid references public.po_lines(id),
  project_id        uuid references public.projects(id),
  piece_count       numeric,
  piece_length      numeric,
  piece_width       numeric,
  status            public.irn_status not null default 'pending_approval',
  generated_by      uuid not null references public.profiles(id),
  generated_at      timestamptz not null default now(),
  approved_by       uuid references public.profiles(id),
  approved_at       timestamptz,
  rejection_reason  text,
  grn_line_id       uuid references public.grn_lines(id),   -- back-filled only on approval
  supersedes_irn_id uuid references public.irns(id),        -- set when this IRN is a resubmission
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  created_by        uuid references public.profiles(id),
  constraint chk_irn_status_fields check (
    (status = 'pending_approval' and approved_by is null and approved_at is null and grn_line_id is null)
    or (status = 'approved' and approved_by is not null and approved_at is not null and grn_line_id is not null)
    or (status = 'rejected' and approved_by is not null and approved_at is not null and grn_line_id is null)
  )
);
alter table public.irns enable row level security;
create trigger trg_irns_updated before update on public.irns
  for each row execute function public.set_updated_at();
create index idx_irns_grn on public.irns(grn_id);
create index idx_irns_component on public.irns(component_id);
create index idx_irns_status on public.irns(status);
create index idx_irns_generated_by on public.irns(generated_by);
create index idx_irns_grn_line on public.irns(grn_line_id) where grn_line_id is not null;

-- ---- IRN answers (per field) -----------------------------------
create table public.irn_answers (
  id           uuid primary key default gen_random_uuid(),
  irn_id       uuid not null references public.irns(id) on delete cascade,
  field_id     uuid not null references public.inspection_template_fields(id),
  text_value   text,
  number_value numeric,
  choice_value text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  created_by   uuid references public.profiles(id),
  unique (irn_id, field_id),
  constraint chk_answer_one_value check (num_nonnulls(text_value, number_value, choice_value) = 1)
);
alter table public.irn_answers enable row level security;
create index idx_irn_answers_irn on public.irn_answers(irn_id);

-- ---- RLS ---------------------------------------------------
-- Inspection templates/fields: masters convention (read=all, write=admin/team_lead)
create policy it_sel on public.inspection_templates for select to authenticated using (true);
create policy it_mod on public.inspection_templates for all to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
grant select, insert, update, delete on public.inspection_templates to authenticated;

create policy itf_sel on public.inspection_template_fields for select to authenticated using (true);
create policy itf_mod on public.inspection_template_fields for all to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
grant select, insert, update, delete on public.inspection_template_fields to authenticated;

-- IRNs/answers: written only via security-definer RPCs (bypass RLS); read = all
-- authenticated (register/approval tabs), direct-write fallback = admin/team_lead.
create policy irns_sel on public.irns for select to authenticated using (true);
create policy irns_mod on public.irns for all to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
grant select, insert, update, delete on public.irns to authenticated;

create policy irn_answers_sel on public.irn_answers for select to authenticated using (true);
create policy irn_answers_mod on public.irn_answers for all to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
grant select, insert, update, delete on public.irn_answers to authenticated;
