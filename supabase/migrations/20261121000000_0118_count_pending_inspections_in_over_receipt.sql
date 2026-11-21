-- Over-receipt check now counts inspections still waiting for approval.
--
-- Before: "how much is left on this PO line" only added up received lines
-- (grn_lines). An item that needs an inspection report sits as a pending IRN
-- until it's approved, and submit_irn did no quantity check at all. So the
-- same PO line could be filled twice over (GRN 0316 welding rods entered again
-- on 0322/0324) or three items could be tagged to one project's line (GRN
-- 0406 bolts), and nobody found out until the approver's signature was blocked.
--
-- Now:
--   * _po_line_taken(): received lines + pending inspections on a PO line.
--   * po_line_over_receipt_error(): the shared message, which also names other
--     lines of the same PO for the same item that still have room
--     ("did you mean Triton 3600?").
--   * submit_irn checks it before creating the inspection.
--   * grn_line_before_insert uses it too, so plain items are checked against
--     pending inspections as well.
--   * approve_irn flags the IRN it is approving, so that IRN isn't counted
--     twice when its own grn_line is inserted.

create or replace function public._po_line_taken(p_po_line_id uuid)
returns numeric language sql stable security definer set search_path = public
as $$
  select coalesce((select sum(l.qty_received) from public.grn_lines l
                    where l.po_line_id = p_po_line_id and l.jw_line_id is null), 0)
       + coalesce((select sum(i.qty) from public.irns i
                    where i.po_line_id = p_po_line_id and i.jw_line_id is null
                      and i.status = 'pending_approval'
                      and i.id::text is distinct from nullif(current_setting('yaha.approving_irn', true), '')), 0);
$$;
revoke all on function public._po_line_taken(uuid) from public, anon, authenticated;

-- Returns null when p_qty fits on the line, otherwise the message to show.
create or replace function public.po_line_over_receipt_error(p_po_line_id uuid, p_qty numeric)
returns text language plpgsql stable security definer set search_path = public
as $$
declare
  v_ord numeric; v_po uuid; v_comp uuid; v_proj text;
  v_taken numeric; v_alt text;
begin
  if p_po_line_id is null or p_qty is null then return null; end if;
  select pl.qty_ordered, pl.po_id, pl.component_id, p.project_no
    into v_ord, v_po, v_comp, v_proj
    from public.po_lines pl left join public.projects p on p.id = pl.project_id
   where pl.id = p_po_line_id;
  if v_ord is null then return null; end if;

  v_taken := public._po_line_taken(p_po_line_id);
  if v_taken + p_qty <= v_ord + 1e-6 then return null; end if;

  select string_agg(coalesce(p.project_no, 'no project') || ' (' || trim_scale(pl.qty_ordered - public._po_line_taken(pl.id)) || ' left)',
                    ', ' order by pl.created_at)
    into v_alt
    from public.po_lines pl left join public.projects p on p.id = pl.project_id
   where pl.po_id = v_po and pl.component_id = v_comp and pl.id <> p_po_line_id
     and pl.qty_ordered - public._po_line_taken(pl.id) > 1e-6;

  return format('Over-receipt blocked: the PO line%s has %s left (ordered %s; %s already received or waiting for inspection). You entered %s.',
                case when v_proj is not null then ' for ' || v_proj else '' end,
                trim_scale(greatest(v_ord - v_taken, 0)), trim_scale(v_ord), trim_scale(v_taken), trim_scale(p_qty))
      || case when v_alt is not null
              then ' This PO has the same item on other lines: ' || v_alt || ' — pick the right one.'
              else ' Revise the PO quantity if the supplier sent more.' end;
end $$;
revoke all on function public.po_line_over_receipt_error(uuid, numeric) from public, anon;
grant execute on function public.po_line_over_receipt_error(uuid, numeric) to authenticated;

-- grn_lines: same as 0105, PO part now uses the shared check.
create or replace function public.grn_line_before_insert()
 returns trigger language plpgsql set search_path to 'public'
as $$
declare
  v_ord  numeric;
  v_recv numeric;
  v_err  text;
begin
  if new.po_line_id is null and new.project_id is null then new.is_untagged := true; end if;

  if new.po_line_id is not null and new.jw_line_id is null then
    v_err := public.po_line_over_receipt_error(new.po_line_id, new.qty_received);
    if v_err is not null then
      raise exception '%', v_err using errcode = 'check_violation';
    end if;
  end if;

  if new.jw_line_id is not null then
    select l.qty_sent,
           greatest(coalesce(l.qty_returned, 0),
                    coalesce((select sum(g.qty_received) from public.grn_lines g where g.jw_line_id = l.id), 0))
      into v_ord, v_recv
      from public.job_work_lines l where l.id = new.jw_line_id;

    if v_ord is not null and v_recv + new.qty_received > v_ord + 1e-6 then
      raise exception
        'Over-receipt blocked: job-work line has % remaining (sent %, already received or awaiting inspection %); this GRN line adds %.',
        greatest(v_ord - v_recv, 0), v_ord, v_recv, new.qty_received
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

-- approve_irn: same as 0117, plus the yaha.approving_irn flag around the insert.
create or replace function public.approve_irn(p_irn_id uuid, p_approver_id uuid, p_signature_id uuid, p_remarks text default null)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_role public.role;
  v_irn record;
  v_line_id uuid;
  v_img text;
begin
  v_role := public.auth_role();
  if v_role is null or v_role not in ('admin','team_lead') then
    return jsonb_build_object('error','Only Admin / Team Lead can approve.');
  end if;

  select image_data_url into v_img from public.signatures where id = p_signature_id and user_id = auth.uid();
  if not found then
    return jsonb_build_object('error', 'Signature not found.');
  end if;

  select * into v_irn from public.irns where id = p_irn_id for update;
  if not found then return jsonb_build_object('error','IRN not found'); end if;
  if v_irn.status <> 'pending_approval' then
    return jsonb_build_object('error','IRN is not pending approval (already '||v_irn.status||')');
  end if;
  if (select status from public.grns where id = v_irn.grn_id) = 'draft' then
    return jsonb_build_object('error','This GRN is still a draft — inspections are approved after it is sent.');
  end if;

  perform set_config('yaha.approving_irn', p_irn_id::text, true);
  insert into public.grn_lines(grn_id, component_id, qty_received, po_line_id, project_id, unit_cost, target_lot_id, jw_line_id,
        piece_count, piece_length, piece_width, piece_weight, created_by)
  values (v_irn.grn_id, v_irn.component_id, v_irn.qty, v_irn.po_line_id, v_irn.project_id, v_irn.unit_cost, v_irn.target_lot_id, v_irn.jw_line_id,
        v_irn.piece_count, v_irn.piece_length, v_irn.piece_width, v_irn.piece_weight, v_irn.generated_by)
  returning id into v_line_id;
  perform set_config('yaha.approving_irn', '', true);

  update public.irns
     set status = 'approved', approved_by = auth.uid(), approved_at = now(), grn_line_id = v_line_id,
         approval_remarks = nullif(trim(p_remarks), '')
   where id = p_irn_id;

  perform public._record_signature('grn', v_irn.grn_id, p_signature_id, auth.uid());

  return jsonb_build_object('ok', true, 'grn_line_id', v_line_id);
end $$;

-- submit_irn: same as before, plus the quantity check up front.
create or replace function public.submit_irn(p_grn_id uuid, p_component_id uuid, p_qty numeric, p_unit_cost numeric, p_po_line_id uuid, p_project_id uuid, p_piece_count numeric, p_piece_length numeric, p_piece_width numeric, p_answers jsonb, p_submitter_id uuid, p_target_lot_id uuid default null, p_piece_weight numeric default null, p_jw_line_id uuid default null, p_signature_id uuid default null)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
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
  v_err text;
begin
  if p_qty is null or p_qty <= 0 then return jsonb_build_object('error','Quantity must be positive'); end if;

  v_role := public.auth_role();
  if v_role is null or v_role not in ('admin','team_lead','team_member','floor') then
    return jsonb_build_object('error','Not authorized to submit an inspection report.');
  end if;

  if p_po_line_id is not null and p_jw_line_id is null then
    v_err := public.po_line_over_receipt_error(p_po_line_id, p_qty);
    if v_err is not null then return jsonb_build_object('error', v_err); end if;
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
end $$;
