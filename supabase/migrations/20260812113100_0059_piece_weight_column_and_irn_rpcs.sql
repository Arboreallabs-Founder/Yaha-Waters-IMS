-- ============================================================
-- 0059 — piece_weight column + thread it through the IRN RPCs, for the
-- new 'weight' quantity_type (pieces + total weight in KG, auto-derived
-- weight/piece — mirrors how piece_length/piece_width already work for
-- 'length'/'area'). No component currently uses 'area', so this is a
-- clean swap at the UI layer; the DB layer never branched on
-- quantity_type in the first place (grn_line_after_insert() and the IRN
-- RPCs only ever forward whichever piece_* values they're given).
-- ============================================================

alter table public.inventory_lots add column piece_weight numeric;
alter table public.irns add column piece_weight numeric;

-- ---- submit_irn: accept p_piece_weight -----------------------------------
drop function if exists public.submit_irn(uuid,uuid,numeric,numeric,uuid,uuid,numeric,numeric,numeric,jsonb,uuid,uuid);

create or replace function public.submit_irn(
  p_grn_id uuid, p_component_id uuid, p_qty numeric, p_unit_cost numeric,
  p_po_line_id uuid, p_project_id uuid,
  p_piece_count numeric, p_piece_length numeric, p_piece_width numeric,
  p_answers jsonb, p_submitter_id uuid, p_target_lot_id uuid default null,
  p_piece_weight numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role public.role;
  v_template uuid;
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

  select inspection_template_id into v_template from public.components where id = p_component_id;
  if v_template is null then return jsonb_build_object('error','This component has no inspection template attached'); end if;

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
        piece_count, piece_length, piece_width, piece_weight, target_lot_id, generated_by, created_by)
  values (v_pno, p_grn_id, p_component_id, v_template, p_qty, p_unit_cost, p_po_line_id, p_project_id,
        p_piece_count, p_piece_length, p_piece_width, p_piece_weight, p_target_lot_id, p_submitter_id, p_submitter_id)
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
grant execute on function public.submit_irn(uuid,uuid,numeric,numeric,uuid,uuid,numeric,numeric,numeric,jsonb,uuid,uuid,numeric) to authenticated;

-- ---- approve_irn: carry piece_weight into the deferred grn_lines/lot patch
create or replace function public.approve_irn(p_irn_id uuid, p_approver_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_irn record;
  v_line_id uuid;
begin
  select * into v_irn from public.irns where id = p_irn_id for update;
  if not found then return jsonb_build_object('error','IRN not found'); end if;
  if v_irn.status <> 'pending_approval' then
    return jsonb_build_object('error','IRN is not pending approval (already '||v_irn.status||')');
  end if;

  insert into public.grn_lines(grn_id, component_id, qty_received, po_line_id, project_id, unit_cost, target_lot_id, created_by)
  values (v_irn.grn_id, v_irn.component_id, v_irn.qty, v_irn.po_line_id, v_irn.project_id, v_irn.unit_cost, v_irn.target_lot_id, v_irn.generated_by)
  returning id into v_line_id;

  -- Mirrors addGrnLine()'s post-creation patch for length/area/weight quantity types.
  if v_irn.piece_count is not null or v_irn.piece_length is not null or v_irn.piece_width is not null or v_irn.piece_weight is not null then
    update public.inventory_lots
       set piece_count = v_irn.piece_count, piece_length = v_irn.piece_length, piece_width = v_irn.piece_width, piece_weight = v_irn.piece_weight
     where grn_line_id = v_line_id;
  end if;

  update public.irns
     set status = 'approved', approved_by = p_approver_id, approved_at = now(), grn_line_id = v_line_id
   where id = p_irn_id;

  return jsonb_build_object('ok', true, 'grn_line_id', v_line_id);
end; $$;
grant execute on function public.approve_irn(uuid, uuid) to authenticated;

-- ---- resubmit_irn: carry piece_weight through the clone -------------------
create or replace function public.resubmit_irn(p_irn_id uuid, p_answers jsonb, p_submitter_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_old record;
  v_result jsonb;
  v_new_id uuid;
begin
  select * into v_old from public.irns where id = p_irn_id;
  if not found then return jsonb_build_object('error','IRN not found'); end if;
  if v_old.status <> 'rejected' then return jsonb_build_object('error','Only a rejected IRN can be resubmitted'); end if;

  v_result := public.submit_irn(v_old.grn_id, v_old.component_id, v_old.qty, v_old.unit_cost,
    v_old.po_line_id, v_old.project_id, v_old.piece_count, v_old.piece_length, v_old.piece_width,
    p_answers, p_submitter_id, v_old.target_lot_id, v_old.piece_weight);
  if v_result ? 'error' then return v_result; end if;

  v_new_id := (v_result->>'id')::uuid;
  update public.irns set supersedes_irn_id = p_irn_id where id = v_new_id;
  return v_result;
end; $$;
grant execute on function public.resubmit_irn(uuid, jsonb, uuid) to authenticated;
