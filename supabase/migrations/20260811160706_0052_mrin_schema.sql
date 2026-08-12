-- ============================================================
-- 0052 — MRIN (Material Receipt cum Inspection Note) module: schema.
-- Reproduces the physical form (Format No. YWSPL/MRIN/001): one MRIN
-- header per GRN (auto-created), one mrin_line per grn_line (auto-synced,
-- carries the new TC No. field), plus the form's two FIXED checklists
-- (8 inspection parameters, 5 document checks — auto-seeded, never
-- user-addable, unlike the configurable inspection_templates below).
--
-- Named "mrin" throughout, deliberately distinct from the pre-existing,
-- unrelated `irns` (Inspection Release Note) module — a per-component QC
-- approval gate that stays untouched. The user-facing "IRN Register" tab
-- label is unaffected; only what it lists changes (see app code).
-- ============================================================

create type public.mrin_disposition as enum ('accepted', 'rejected', 'hold', 'accepted_with_deviation');

create sequence if not exists public.seq_mrin_no;
grant usage on sequence public.seq_mrin_no to authenticated;

create or replace function public.next_mrin_no() returns text
  language sql set search_path = public as $$
  select 'MRIN/' || public.fiscal_year_label() || '/' || lpad(nextval('public.seq_mrin_no')::text,4,'0'); $$;
grant execute on function public.next_mrin_no() to authenticated;

create table public.mrins (
  id                uuid primary key default gen_random_uuid(),
  mrin_no           text not null unique,
  grn_id            uuid not null unique references public.grns(id) on delete cascade,
  vehicle_no        text,
  project_customer  text,
  disposition       public.mrin_disposition,
  remarks           text,
  prepared_by_name  text,
  inspected_by_name text,
  approved_by_name  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  created_by        uuid references public.profiles(id)
);
alter table public.mrins enable row level security;
create trigger trg_mrins_updated before update on public.mrins
  for each row execute function public.set_updated_at();
create index idx_mrins_grn on public.mrins(grn_id);

create table public.mrin_inspection_checks (
  id          uuid primary key default gen_random_uuid(),
  mrin_id     uuid not null references public.mrins(id) on delete cascade,
  param_key   text not null,   -- 'quantity'|'grade'|'heat_no'|'size'|'visual'|'surface'|'packing'|'mtc_available'
  label       text not null,   -- fixed display label, e.g. "Quantity Verification"
  requirement text not null,   -- fixed default text, e.g. "As PO"
  result      text,
  status      text,
  remarks     text,
  sort_order  int not null default 0,
  updated_at  timestamptz,
  unique (mrin_id, param_key)
);
alter table public.mrin_inspection_checks enable row level security;
create index idx_mic_mrin on public.mrin_inspection_checks(mrin_id);

create table public.mrin_document_checks (
  id          uuid primary key default gen_random_uuid(),
  mrin_id     uuid not null references public.mrins(id) on delete cascade,
  doc_key     text not null,   -- 'mtc'|'invoice'|'delivery_challan'|'packing_list'|'inspection_report'
  label       text not null,
  ok          boolean,         -- null = unanswered, true = Yes, false = No
  remarks     text,
  sort_order  int not null default 0,
  updated_at  timestamptz,
  unique (mrin_id, doc_key)
);
alter table public.mrin_document_checks enable row level security;
create index idx_mdc_mrin on public.mrin_document_checks(mrin_id);

create table public.mrin_lines (
  id            uuid primary key default gen_random_uuid(),
  mrin_id       uuid not null references public.mrins(id) on delete cascade,
  grn_line_id   uuid not null unique references public.grn_lines(id) on delete cascade,
  accepted_qty  numeric not null default 0,
  rejected_qty  numeric not null default 0,
  heat_no       text,
  tc_no         text,          -- Test Certificate No. — per line item
  remarks       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  created_by    uuid references public.profiles(id)
);
alter table public.mrin_lines enable row level security;
create trigger trg_mrin_lines_updated before update on public.mrin_lines
  for each row execute function public.set_updated_at();
create index idx_mrin_lines_mrin on public.mrin_lines(mrin_id);

-- ---- auto-create mrins (+ seed both fixed checklists) on grns insert ----
-- mrin_no is assigned right here, at GRN-creation time — mirrors how
-- grn_no/po_no/irn_no are assigned at their own header's creation, never
-- deferred, so a MRIN literally exists the instant its GRN exists.
create or replace function public.mrin_after_grn_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_mrin_id uuid; v_no text;
begin
  select public.next_mrin_no() into v_no;
  insert into public.mrins(mrin_no, grn_id, created_by)
  values (v_no, new.id, new.created_by)
  returning id into v_mrin_id;

  insert into public.mrin_inspection_checks(mrin_id, param_key, label, requirement, sort_order) values
    (v_mrin_id, 'quantity',      'Quantity Verification',  'As PO',             1),
    (v_mrin_id, 'grade',         'Material Grade',         'As Per PO/MTC',     2),
    (v_mrin_id, 'heat_no',       'Heat No.',                'Match MTC',         3),
    (v_mrin_id, 'size',          'Size Verification',       'As per PO/Drawing', 4),
    (v_mrin_id, 'visual',        'Visual Inspection',       'OK',                5),
    (v_mrin_id, 'surface',       'Surface Condition',       'No Damage',         6),
    (v_mrin_id, 'packing',       'Packing Condition',       'Good',              7),
    (v_mrin_id, 'mtc_available', 'MTC Available',           'Yes',               8);

  insert into public.mrin_document_checks(mrin_id, doc_key, label, sort_order) values
    (v_mrin_id, 'mtc',               'MTC',               1),
    (v_mrin_id, 'invoice',           'Invoice',           2),
    (v_mrin_id, 'delivery_challan',  'Delivery Challan',  3),
    (v_mrin_id, 'packing_list',      'Packing List',      4),
    (v_mrin_id, 'inspection_report', 'Inspection Report', 5);

  return new;
end; $$;
create trigger trg_mrin_after_grn_insert
  after insert on public.grns
  for each row execute function public.mrin_after_grn_insert();

-- ---- auto-sync mrin_lines on grn_lines insert -----------------------
-- New, additive trigger only — grn_line_before_insert()/grn_line_after_insert()
-- (lot + stock-movement creation, 0032/0008) are NOT modified. Fires for
-- every grn_lines insert regardless of origin: the app's normal receiving
-- flow, AND approve_irn()'s deferred insert for inspection-gated
-- components — so a gated component's line still lands on the MRIN once
-- its old-style IRN is approved.
create or replace function public.mrin_line_after_grn_line_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_mrin_id uuid;
begin
  select id into v_mrin_id from public.mrins where grn_id = new.grn_id;
  if v_mrin_id is null then
    -- safety net only (mrins should already exist via trg_mrin_after_grn_insert)
    insert into public.mrins(mrin_no, grn_id, created_by)
    values (public.next_mrin_no(), new.grn_id, new.created_by)
    returning id into v_mrin_id;
  end if;

  insert into public.mrin_lines(mrin_id, grn_line_id, accepted_qty, rejected_qty, created_by)
  values (v_mrin_id, new.id, new.qty_received, 0, new.created_by)
  on conflict (grn_line_id) do nothing;

  return new;
end; $$;
create trigger trg_mrin_line_after_grn_line_insert
  after insert on public.grn_lines
  for each row execute function public.mrin_line_after_grn_line_insert();

-- ---- backfill for pre-existing data ----------------------------------
insert into public.mrins (mrin_no, grn_id, created_by, created_at)
select public.next_mrin_no(), g.id, g.created_by, g.created_at
from public.grns g
where not exists (select 1 from public.mrins m where m.grn_id = g.id)
order by g.created_at;

insert into public.mrin_inspection_checks (mrin_id, param_key, label, requirement, sort_order)
select m.id, x.param_key, x.label, x.requirement, x.sort_order
from public.mrins m
cross join (values
  ('quantity','Quantity Verification','As PO',1),
  ('grade','Material Grade','As Per PO/MTC',2),
  ('heat_no','Heat No.','Match MTC',3),
  ('size','Size Verification','As per PO/Drawing',4),
  ('visual','Visual Inspection','OK',5),
  ('surface','Surface Condition','No Damage',6),
  ('packing','Packing Condition','Good',7),
  ('mtc_available','MTC Available','Yes',8)
) as x(param_key, label, requirement, sort_order)
where not exists (select 1 from public.mrin_inspection_checks c where c.mrin_id = m.id and c.param_key = x.param_key);

insert into public.mrin_document_checks (mrin_id, doc_key, label, sort_order)
select m.id, x.doc_key, x.label, x.sort_order
from public.mrins m
cross join (values
  ('mtc','MTC',1), ('invoice','Invoice',2), ('delivery_challan','Delivery Challan',3),
  ('packing_list','Packing List',4), ('inspection_report','Inspection Report',5)
) as x(doc_key, label, sort_order)
where not exists (select 1 from public.mrin_document_checks c where c.mrin_id = m.id and c.doc_key = x.doc_key);

insert into public.mrin_lines (mrin_id, grn_line_id, accepted_qty, rejected_qty, created_by, created_at)
select m.id, gl.id, gl.qty_received, 0, gl.created_by, gl.created_at
from public.grn_lines gl
join public.mrins m on m.grn_id = gl.grn_id
where not exists (select 1 from public.mrin_lines ml where ml.grn_line_id = gl.id);

-- ---- RLS: read = all authenticated; write = admin/team_lead direct-
-- write fallback (real write path is save_mrin(), a security-definer RPC
-- granted to admin/team_lead/team_member — the RLS policy here is a
-- defense-in-depth backstop, mirroring the irns_mod convention). ------
create policy mrins_sel on public.mrins for select to authenticated using (true);
create policy mrins_mod on public.mrins for all to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
grant select, insert, update, delete on public.mrins to authenticated;

create policy mic_sel on public.mrin_inspection_checks for select to authenticated using (true);
create policy mic_mod on public.mrin_inspection_checks for all to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
grant select, insert, update, delete on public.mrin_inspection_checks to authenticated;

create policy mdc_sel on public.mrin_document_checks for select to authenticated using (true);
create policy mdc_mod on public.mrin_document_checks for all to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
grant select, insert, update, delete on public.mrin_document_checks to authenticated;

create policy mrin_lines_sel on public.mrin_lines for select to authenticated using (true);
create policy mrin_lines_mod on public.mrin_lines for all to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
grant select, insert, update, delete on public.mrin_lines to authenticated;
