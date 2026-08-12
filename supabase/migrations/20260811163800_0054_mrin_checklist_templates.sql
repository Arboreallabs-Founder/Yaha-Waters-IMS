-- ============================================================
-- 0054 — MRIN checklist becomes an admin-editable template master,
-- replacing the two fixed-schema tables from 0052 (mrin_inspection_checks,
-- mrin_document_checks). Mirrors the existing inspection_templates /
-- inspection_template_fields precedent (0036_irn_schema.sql), but as a
-- single flat, global checklist — MRIN applies to every GRN, no
-- per-component attachment.
--
-- Each checklist row's answer collapses from the old three boxes
-- (Result, Status, Remarks) to ONE answer value (checkbox tick or free
-- text, per the field's configured input_type) + Remarks.
--
-- Confirmed via execute_sql before writing this migration: zero real
-- answers exist in the old tables (feature shipped same-day) — safe to
-- cut over structurally with no data migration.
-- ============================================================

create type public.mrin_checklist_section as enum ('inspection', 'document');
create type public.mrin_input_type as enum ('checkbox', 'text');

create table public.mrin_checklist_fields (
  id          uuid primary key default gen_random_uuid(),
  section     public.mrin_checklist_section not null,
  label       text not null,
  requirement text,                                    -- fixed reference text, e.g. "As PO" — optional
  input_type  public.mrin_input_type not null default 'checkbox',
  is_required boolean not null default true,
  is_active   boolean not null default true,            -- soft-delete: never hard-delete once answers reference it
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  created_by  uuid references public.profiles(id)
);
alter table public.mrin_checklist_fields enable row level security;
create trigger trg_mrin_checklist_fields_updated before update on public.mrin_checklist_fields
  for each row execute function public.set_updated_at();
create index idx_mrin_checklist_fields_section on public.mrin_checklist_fields(section, sort_order);

create table public.mrin_checklist_answers (
  id             uuid primary key default gen_random_uuid(),
  mrin_id        uuid not null references public.mrins(id) on delete cascade,
  field_id       uuid not null references public.mrin_checklist_fields(id),
  checkbox_value boolean,       -- used when the field's input_type = 'checkbox'
  text_value     text,          -- used when the field's input_type = 'text'
  remarks        text,
  updated_at     timestamptz,
  unique (mrin_id, field_id)
);
alter table public.mrin_checklist_answers enable row level security;
create index idx_mrin_checklist_answers_mrin on public.mrin_checklist_answers(mrin_id);

-- ---- seed: the original 8 inspection + 5 document rows, preserved verbatim ----
insert into public.mrin_checklist_fields (section, label, requirement, input_type, is_required, sort_order) values
  ('inspection', 'Quantity Verification',  'As PO',              'checkbox', true, 1),
  ('inspection', 'Material Grade',         'As Per PO/MTC',      'checkbox', true, 2),
  ('inspection', 'Heat No.',                'Match MTC',          'checkbox', true, 3),
  ('inspection', 'Size Verification',       'As per PO/Drawing',  'checkbox', true, 4),
  ('inspection', 'Visual Inspection',       'OK',                 'checkbox', true, 5),
  ('inspection', 'Surface Condition',       'No Damage',          'checkbox', true, 6),
  ('inspection', 'Packing Condition',       'Good',                'checkbox', true, 7),
  ('inspection', 'MTC Available',           'Yes',                 'checkbox', true, 8),
  ('document',   'MTC',               null, 'checkbox', true, 1),
  ('document',   'Invoice',           null, 'checkbox', true, 2),
  ('document',   'Delivery Challan',  null, 'checkbox', true, 3),
  ('document',   'Packing List',      null, 'checkbox', true, 4),
  ('document',   'Inspection Report', null, 'checkbox', true, 5);

-- ---- simplify mrin_after_grn_insert(): checklist rows are no longer
-- pre-seeded — the form/print pages render by iterating live
-- mrin_checklist_fields against any existing mrin_checklist_answers row,
-- and save_mrin() upserts. This means adding a checklist field later
-- doesn't require backfilling every existing MRIN. -------------------
create or replace function public.mrin_after_grn_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_no text;
begin
  select public.next_mrin_no() into v_no;
  insert into public.mrins(mrin_no, grn_id, created_by)
  values (v_no, new.id, new.created_by);
  return new;
end; $$;

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

drop table public.mrin_inspection_checks;
drop table public.mrin_document_checks;

-- ---- RLS: read = all authenticated; write = admin/team_lead direct-
-- write fallback (real write paths: mrin_checklist_fields via plain
-- server actions gated by canWriteMasters, mrin_checklist_answers via
-- the save_mrin() RPC below). -----------------------------------------
create policy mcf_sel on public.mrin_checklist_fields for select to authenticated using (true);
create policy mcf_mod on public.mrin_checklist_fields for all to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
grant select, insert, update, delete on public.mrin_checklist_fields to authenticated;

create policy mca_sel on public.mrin_checklist_answers for select to authenticated using (true);
create policy mca_mod on public.mrin_checklist_answers for all to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
grant select, insert, update, delete on public.mrin_checklist_answers to authenticated;

-- ---- save_mrin(): p_checks/p_docs collapse into one p_answers array ----
drop function public.save_mrin(uuid, uuid, jsonb, jsonb, jsonb, jsonb);

create or replace function public.save_mrin(
  p_mrin_id uuid,
  p_actor_id uuid,
  p_header jsonb,   -- {vehicle_no, project_customer, disposition, remarks,
                     --  prepared_by_name, inspected_by_name, approved_by_name}
  p_answers jsonb,  -- [{field_id, checkbox_value, text_value, remarks}]
  p_lines  jsonb    -- [{id, accepted_qty, rejected_qty, heat_no, tc_no, remarks}]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_role public.role; v_row jsonb;
begin
  select role into v_role from public.profiles where id = p_actor_id;
  if v_role is null or v_role not in ('admin','team_lead','team_member') then
    return jsonb_build_object('error','Not authorized to save the MRIN.');
  end if;
  if not exists (select 1 from public.mrins where id = p_mrin_id) then
    return jsonb_build_object('error','MRIN not found.');
  end if;

  update public.mrins set
    vehicle_no = nullif(trim(p_header->>'vehicle_no'), ''),
    project_customer = nullif(trim(p_header->>'project_customer'), ''),
    disposition = case when coalesce(p_header->>'disposition','') <> '' then (p_header->>'disposition')::public.mrin_disposition else null end,
    remarks = nullif(trim(p_header->>'remarks'), ''),
    prepared_by_name = nullif(trim(p_header->>'prepared_by_name'), ''),
    inspected_by_name = nullif(trim(p_header->>'inspected_by_name'), ''),
    approved_by_name = nullif(trim(p_header->>'approved_by_name'), '')
  where id = p_mrin_id;

  for v_row in select * from jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) loop
    insert into public.mrin_checklist_answers(mrin_id, field_id, checkbox_value, text_value, remarks, updated_at)
    values (
      p_mrin_id,
      (v_row->>'field_id')::uuid,
      case when v_row ? 'checkbox_value' and v_row->>'checkbox_value' <> '' then (v_row->>'checkbox_value')::boolean else null end,
      nullif(trim(v_row->>'text_value'), ''),
      nullif(trim(v_row->>'remarks'), ''),
      now()
    )
    on conflict (mrin_id, field_id) do update set
      checkbox_value = excluded.checkbox_value,
      text_value = excluded.text_value,
      remarks = excluded.remarks,
      updated_at = now();
  end loop;

  for v_row in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    update public.mrin_lines set
      accepted_qty = coalesce((v_row->>'accepted_qty')::numeric, 0),
      rejected_qty = coalesce((v_row->>'rejected_qty')::numeric, 0),
      heat_no = nullif(trim(v_row->>'heat_no'), ''),
      tc_no = nullif(trim(v_row->>'tc_no'), ''),
      remarks = nullif(trim(v_row->>'remarks'), ''),
      updated_at = now()
    where id = (v_row->>'id')::uuid and mrin_id = p_mrin_id;
  end loop;

  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.save_mrin(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;
