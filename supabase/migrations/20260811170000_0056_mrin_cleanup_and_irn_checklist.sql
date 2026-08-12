-- ============================================================
-- 0056 — Consolidate MRIN entirely into the existing IRN module.
--
-- The last two sessions built a separate MRIN feature (mrins/mrin_lines
-- header+line tables, an admin-editable mrin_checklist_fields/answers
-- pair, a standalone /grn/[id]/mrin route). Confirmed via execute_sql:
-- zero real rows in any of these tables, and zero real rows in the
-- pre-existing, unrelated IRN module either — nothing has been used in
-- production. The user clarified inspection should be captured per line
-- item at add-time, gated by an approval process, with no separate MRIN
-- entity at all — exactly what the IRN module (submit_irn/approve_irn/
-- reject_irn, inspection_templates/inspection_template_fields) already
-- does. This migration deletes the separate MRIN schema and repurposes
-- the IRN module: seeds one universal 7-field checklist, attaches it to
-- every non-box component, and adds per-component field eligibility.
-- ============================================================

-- ---- drop the separate MRIN schema (dependency order) -----------------
drop trigger if exists trg_mrin_line_after_grn_line_insert on public.grn_lines;
drop trigger if exists trg_mrin_after_grn_insert on public.grns;
drop function if exists public.mrin_line_after_grn_line_insert();
drop function if exists public.mrin_after_grn_insert();
drop function if exists public.save_mrin(uuid, uuid, jsonb, jsonb, jsonb);
drop function if exists public.next_mrin_no();
drop table if exists public.mrin_checklist_answers cascade;
drop table if exists public.mrin_lines cascade;
drop table if exists public.mrin_checklist_fields cascade;
drop table if exists public.mrins cascade;
drop sequence if exists public.seq_mrin_no;
drop type if exists public.mrin_disposition;
drop type if exists public.mrin_checklist_section;
drop type if exists public.mrin_input_type;

-- ---- per-component field eligibility (opt-out: presence = excluded) ---
create table public.component_inspection_field_exclusions (
  component_id uuid not null references public.components(id) on delete cascade,
  field_id     uuid not null references public.inspection_template_fields(id) on delete cascade,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  primary key (component_id, field_id)
);
alter table public.component_inspection_field_exclusions enable row level security;
create index idx_cife_field on public.component_inspection_field_exclusions(field_id);

create policy cife_sel on public.component_inspection_field_exclusions for select to authenticated using (true);
create policy cife_mod on public.component_inspection_field_exclusions for all to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
grant select, insert, update, delete on public.component_inspection_field_exclusions to authenticated;

-- ---- seed the universal MRIN checklist as one inspection_template -----
insert into public.inspection_templates (name, description, is_active)
values ('MRIN Inspection Checklist', 'Per-item receiving inspection — applied to every item/bulk-tracked component.', true);

insert into public.inspection_template_fields (template_id, label, field_type, is_required, sort_order)
select t.id, x.label, x.field_type::public.irn_field_type, true, x.sort_order
from public.inspection_templates t
cross join (values
  ('Quality Remarks',       'text',     1),
  ('Size Verification',     'checkbox', 2),
  ('Visual Inspection',     'checkbox', 3),
  ('Heat No.',               'text',     4),
  ('MTC',                    'checkbox', 5),
  ('Packaging Condition',    'checkbox', 6),
  ('Test Certificate No.',   'text',     7)
) as x(label, field_type, sort_order)
where t.name = 'MRIN Inspection Checklist';

-- ---- attach it to every item/bulk-tracked component --------------------
-- box-tracked components stay ungated: chk_components_irn_not_box already
-- forbids attaching a template to them — a shared-lot box can't carry
-- per-piece inspection answers.
update public.components
set inspection_template_id = (select id from public.inspection_templates where name = 'MRIN Inspection Checklist')
where tracking_mode <> 'box';

-- ---- submit_irn(): filter both loops by eligibility, add checkbox -----
create or replace function public.submit_irn(
  p_grn_id uuid, p_component_id uuid, p_qty numeric, p_unit_cost numeric,
  p_po_line_id uuid, p_project_id uuid,
  p_piece_count numeric, p_piece_length numeric, p_piece_width numeric,
  p_answers jsonb, p_submitter_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role public.role;
  v_template uuid;
  v_tracking public.tracking_mode;
  v_irn uuid;
  v_pno text;
  v_field record;
  v_ans jsonb;
  v_missing text[] := '{}';
  v_res jsonb;
begin
  if p_qty is null or p_qty <= 0 then return jsonb_build_object('error','Quantity must be positive'); end if;

  select role into v_role from public.profiles where id = p_submitter_id;
  if v_role is null then return jsonb_build_object('error','Submitter not found'); end if;

  select inspection_template_id, tracking_mode into v_template, v_tracking
    from public.components where id = p_component_id;
  if v_template is null then return jsonb_build_object('error','This component has no inspection template attached'); end if;
  if v_tracking = 'box' then return jsonb_build_object('error','Box-tracked components cannot be inspection-gated'); end if;

  for v_field in
    select id, label, is_required from public.inspection_template_fields
    where template_id = v_template and is_active = true
      and not exists (
        select 1 from public.component_inspection_field_exclusions x
        where x.component_id = p_component_id and x.field_id = inspection_template_fields.id
      )
  loop
    v_ans := (select a from jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) a where a->>'field_id' = v_field.id::text limit 1);
    if v_field.is_required and (v_ans is null or (v_ans->>'value') is null or trim(v_ans->>'value') = '') then
      v_missing := array_append(v_missing, v_field.label);
    end if;
  end loop;
  if array_length(v_missing, 1) > 0 then
    return jsonb_build_object('error', 'Missing required field(s): ' || array_to_string(v_missing, ', '));
  end if;

  select public.next_irn_no() into v_pno;
  insert into public.irns(irn_no, grn_id, component_id, template_id, qty, unit_cost, po_line_id, project_id,
        piece_count, piece_length, piece_width, generated_by, created_by)
  values (v_pno, p_grn_id, p_component_id, v_template, p_qty, p_unit_cost, p_po_line_id, p_project_id,
        p_piece_count, p_piece_length, p_piece_width, p_submitter_id, p_submitter_id)
  returning id into v_irn;

  for v_field in
    select id, field_type from public.inspection_template_fields
    where template_id = v_template and is_active = true
      and not exists (
        select 1 from public.component_inspection_field_exclusions x
        where x.component_id = p_component_id and x.field_id = inspection_template_fields.id
      )
  loop
    v_ans := (select a from jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) a where a->>'field_id' = v_field.id::text limit 1);
    if v_ans is not null and (v_ans->>'value') is not null and trim(v_ans->>'value') <> '' then
      insert into public.irn_answers(irn_id, field_id, text_value, number_value, choice_value, created_by)
      values (
        v_irn, v_field.id,
        case when v_field.field_type = 'text' then v_ans->>'value' else null end,
        case when v_field.field_type = 'number' then (v_ans->>'value')::numeric else null end,
        case when v_field.field_type in ('choice','checkbox') then v_ans->>'value' else null end,
        p_submitter_id
      );
    end if;
  end loop;

  if v_role in ('admin','team_lead') then
    v_res := public.approve_irn(v_irn, p_submitter_id);
    return v_res || jsonb_build_object('id', v_irn, 'irn_no', v_pno, 'status', 'approved');
  end if;

  return jsonb_build_object('ok', true, 'id', v_irn, 'irn_no', v_pno, 'status', 'pending_approval');
end; $$;
grant execute on function public.submit_irn(uuid,uuid,numeric,numeric,uuid,uuid,numeric,numeric,numeric,jsonb,uuid) to authenticated;
