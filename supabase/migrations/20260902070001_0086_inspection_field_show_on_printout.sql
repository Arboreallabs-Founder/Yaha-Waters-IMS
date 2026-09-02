-- ============================================================
-- 0086 — "View on printout" per-field toggle for inspection
-- templates. Unchecked fields are still asked and saved at GRN
-- goods-receipt time, but never appear as a column on the printed
-- GRN (MRIN). Default true preserves current behavior for every
-- existing field.
--
-- Also fixes submit_irn: it hard-codes which irn_answers column
-- each field_type writes to (text_value / number_value /
-- choice_value). Without this fix, a 'link' field's answer would
-- pass the required-field check, get "saved", and then land in
-- none of the three columns — silently discarded. Same body as
-- 0080's version, with field_type = 'text' widened to
-- field_type in ('text','link').
-- ============================================================

alter table public.inspection_template_fields
  add column show_on_printout boolean not null default true;

create or replace function public.submit_irn(
  p_grn_id uuid, p_component_id uuid, p_qty numeric, p_unit_cost numeric, p_po_line_id uuid,
  p_project_id uuid, p_piece_count numeric, p_piece_length numeric, p_piece_width numeric,
  p_answers jsonb, p_submitter_id uuid, p_target_lot_id uuid default null,
  p_piece_weight numeric default null, p_jw_line_id uuid default null, p_signature_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role public.role;
  v_actor uuid := auth.uid();
  v_template uuid;
  v_irn uuid;
  v_pno text;
  v_field record;
  v_ans jsonb;
  v_missing text[] := '{}';
  v_res jsonb;
begin
  if p_qty is null or p_qty <= 0 then return jsonb_build_object('error','Quantity must be positive'); end if;

  v_role := public.auth_role();
  if v_role is null or v_role not in ('admin','team_lead','team_member') then
    return jsonb_build_object('error','Not authorized to submit an inspection report.');
  end if;

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
        piece_count, piece_length, piece_width, piece_weight, target_lot_id, jw_line_id, generated_by, created_by)
  values (v_pno, p_grn_id, p_component_id, v_template, p_qty, p_unit_cost, p_po_line_id, p_project_id,
        p_piece_count, p_piece_length, p_piece_width, p_piece_weight, p_target_lot_id, p_jw_line_id, v_actor, v_actor)
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
        case when v_field.field_type in ('text','link') then v_ans->>'value' else null end,
        case when v_field.field_type = 'number' then (v_ans->>'value')::numeric else null end,
        case when v_field.field_type in ('choice','checkbox') then v_ans->>'value' else null end,
        v_actor
      );
    end if;
  end loop;

  if v_role in ('admin','team_lead') and p_signature_id is not null then
    v_res := public.approve_irn(v_irn, v_actor, p_signature_id, null);
    if not (v_res ? 'error') then
      return v_res || jsonb_build_object('id', v_irn, 'irn_no', v_pno, 'status', 'approved');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'id', v_irn, 'irn_no', v_pno, 'status', 'pending_approval');
end; $function$;
