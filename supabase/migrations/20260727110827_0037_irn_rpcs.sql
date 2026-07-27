-- ============================================================
-- 0037 — IRN module: RPCs (submit / approve / reject / resubmit) and the
-- lot traceability aggregator.
--
-- Key design: grn_line_after_insert() (the existing lot/QR-creation trigger)
-- is left completely untouched. For an inspection-gated component, the real
-- `grn_lines` row is only inserted at approval time (auto-approval happens
-- inside submit_irn's own transaction when the submitter is admin/team_lead)
-- — that insert is what fires the unmodified trigger. This means PO
-- fulfillment tracking (rollup_po_line) stays correct for free: a PO line
-- isn't "received" while goods are still pending/failing QC.
-- ============================================================

create or replace function public.next_irn_no() returns text
  language sql set search_path = public as $$
  select 'IRN/' || public.fiscal_year_label() || '/' || lpad(nextval('public.seq_irn_no')::text,4,'0');
$$;
grant execute on function public.next_irn_no() to authenticated;

-- ---- approve: insert the real grn_lines row (fires the existing trigger) --
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

  insert into public.grn_lines(grn_id, component_id, qty_received, po_line_id, project_id, unit_cost, created_by)
  values (v_irn.grn_id, v_irn.component_id, v_irn.qty, v_irn.po_line_id, v_irn.project_id, v_irn.unit_cost, v_irn.generated_by)
  returning id into v_line_id;

  -- Mirrors addGrnLine()'s post-creation patch for length/area quantity types.
  if v_irn.piece_count is not null or v_irn.piece_length is not null or v_irn.piece_width is not null then
    update public.inventory_lots
       set piece_count = v_irn.piece_count, piece_length = v_irn.piece_length, piece_width = v_irn.piece_width
     where grn_line_id = v_line_id;
  end if;

  update public.irns
     set status = 'approved', approved_by = p_approver_id, approved_at = now(), grn_line_id = v_line_id
   where id = p_irn_id;

  return jsonb_build_object('ok', true, 'grn_line_id', v_line_id);
end; $$;
grant execute on function public.approve_irn(uuid, uuid) to authenticated;

-- ---- reject: terminal, permanent record — never touches inventory --------
create or replace function public.reject_irn(p_irn_id uuid, p_approver_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.irns
     set status = 'rejected', approved_by = p_approver_id, approved_at = now(), rejection_reason = p_reason
   where id = p_irn_id and status = 'pending_approval';
  if not found then return jsonb_build_object('error','IRN not pending approval'); end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.reject_irn(uuid, uuid, text) to authenticated;

-- ---- submit: validate answers, insert header+answers, auto-approve if
-- the submitter is admin/team_lead. p_answers shape: [{"field_id":"uuid","value":"..."}]
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
    select id, field_type from public.inspection_template_fields where template_id = v_template and is_active = true
  loop
    v_ans := (select a from jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) a where a->>'field_id' = v_field.id::text limit 1);
    if v_ans is not null and (v_ans->>'value') is not null and trim(v_ans->>'value') <> '' then
      insert into public.irn_answers(irn_id, field_id, text_value, number_value, choice_value, created_by)
      values (
        v_irn, v_field.id,
        case when v_field.field_type = 'text' then v_ans->>'value' else null end,
        case when v_field.field_type = 'number' then (v_ans->>'value')::numeric else null end,
        case when v_field.field_type = 'choice' then v_ans->>'value' else null end,
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

-- ---- resubmit: clone a rejected IRN's header into a fresh submission ------
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
    p_answers, p_submitter_id);
  if v_result ? 'error' then return v_result; end if;

  v_new_id := (v_result->>'id')::uuid;
  update public.irns set supersedes_irn_id = p_irn_id where id = v_new_id;
  return v_result;
end; $$;
grant execute on function public.resubmit_irn(uuid, jsonb, uuid) to authenticated;

-- ---- traceability: full genealogy for one lot -----------------------------
create or replace function public.get_lot_traceability(p_lot_code text)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_lot record;
  v_lineage_ids uuid[];
  v_root_lot_id uuid;
  v_lineage jsonb;
  v_po jsonb;
  v_grn jsonb;
  v_jw jsonb;
  v_irn jsonb;
  v_movements jsonb;
begin
  select * into v_lot from public.inventory_lots where lot_code = p_lot_code;
  if not found then return jsonb_build_object('error', 'Lot not found'); end if;

  with recursive lineage as (
    select l.id, l.parent_lot_id, 0 as depth from public.inventory_lots l where l.id = v_lot.id
    union all
    select p.id, p.parent_lot_id, lineage.depth + 1
    from public.inventory_lots p join lineage on lineage.parent_lot_id = p.id
  )
  select array_agg(id) into v_lineage_ids from lineage;

  select id into v_root_lot_id
  from public.inventory_lots where id = any(v_lineage_ids) and parent_lot_id is null
  order by created_at asc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'lot_id', l.id, 'lot_code', l.lot_code, 'jw_stage', l.jw_stage, 'created_at', l.created_at
    ) order by l.created_at asc), '[]')
    into v_lineage
  from public.inventory_lots l where l.id = any(v_lineage_ids);

  select coalesce(jsonb_agg(jsonb_build_object(
      'jw_no', jwo.jw_no, 'vendor_name', v.name, 'sent_date', jwo.sent_date, 'expected_date', jwo.expected_date,
      'status', jwo.status, 'qty_sent', jwl.qty_sent, 'qty_returned', jwl.qty_returned,
      'raw_lot_code', rawlot.lot_code, 'completed_lot_code', complot.lot_code
    )), '[]')
    into v_jw
  from public.job_work_lines jwl
  join public.job_work_orders jwo on jwo.id = jwl.jw_order_id
  left join public.vendors v on v.id = jwo.vendor_id
  left join public.inventory_lots rawlot on rawlot.id = jwl.raw_lot_id
  left join public.inventory_lots complot on complot.id = jwl.completed_lot_id
  where jwl.raw_lot_id = any(v_lineage_ids) or jwl.completed_lot_id = any(v_lineage_ids);

  select jsonb_build_object(
      'po_no', po.po_no, 'po_date', po.po_date, 'raised_by', praiser.full_name,
      'vendor_name', pv.name, 'qty_ordered', pol.qty_ordered, 'rate', pol.rate
    ) into v_po
  from public.inventory_lots il
  join public.grn_lines gl on gl.id = il.grn_line_id
  left join public.po_lines pol on pol.id = gl.po_line_id
  left join public.purchase_orders po on po.id = pol.po_id
  left join public.profiles praiser on praiser.id = po.created_by
  left join public.vendors pv on pv.id = po.vendor_id
  where il.id = v_root_lot_id;

  select jsonb_build_object(
      'grn_no', g.grn_no, 'challan_no', g.challan_no, 'invoice_no', g.invoice_no,
      'received_by', recv.full_name, 'received_at', g.received_at, 'is_untagged', gl.is_untagged
    ) into v_grn
  from public.inventory_lots il
  join public.grn_lines gl on gl.id = il.grn_line_id
  join public.grns g on g.id = gl.grn_id
  left join public.profiles recv on recv.id = g.received_by
  where il.id = v_root_lot_id;

  select jsonb_build_object(
      'irn_no', i.irn_no, 'status', i.status, 'template_name', t.name,
      'generated_by', gen.full_name, 'generated_at', i.generated_at,
      'approved_by', app.full_name, 'approved_at', i.approved_at,
      'rejection_reason', i.rejection_reason
    ) into v_irn
  from public.inventory_lots il
  join public.grn_lines gl on gl.id = il.grn_line_id
  join public.irns i on i.grn_line_id = gl.id
  left join public.inspection_templates t on t.id = i.template_id
  left join public.profiles gen on gen.id = i.generated_by
  left join public.profiles app on app.id = i.approved_by
  where il.id = v_root_lot_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'movement_type', sm.movement_type, 'qty', sm.qty, 'project_no', pr.project_no,
      'reference_type', sm.reference_type, 'reference_id', sm.reference_id,
      'performed_by', perf.full_name, 'performed_at', sm.performed_at, 'note', sm.note
    ) order by sm.performed_at desc), '[]')
    into v_movements
  from public.stock_movements sm
  left join public.projects pr on pr.id = sm.project_id
  left join public.profiles perf on perf.id = sm.performed_by
  where sm.lot_id = v_lot.id;

  return jsonb_build_object(
    'lot', jsonb_build_object('id', v_lot.id, 'lot_code', v_lot.lot_code, 'component_id', v_lot.component_id,
      'status', v_lot.status, 'qty_on_hand', v_lot.qty_on_hand, 'qty_initial', v_lot.qty_initial,
      'unit_cost', v_lot.unit_cost, 'jw_stage', v_lot.jw_stage, 'created_at', v_lot.created_at),
    'lineage', v_lineage,
    'purchase_order', v_po,
    'grn', v_grn,
    'job_work', v_jw,
    'irn', v_irn,
    'movements', v_movements
  );
end; $$;
grant execute on function public.get_lot_traceability(text) to authenticated;
