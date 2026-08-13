-- Harden SECURITY DEFINER RPCs to derive the acting user/role from the real
-- session (auth.uid() / auth_role()) instead of trusting a client-supplied
-- parameter. Signatures are unchanged, so no app-layer callers need to
-- change. See security-audit findings #1 (RPC trust) and #2 (public RLS
-- exposure on job_work_orders/job_work_lines).

-- ---------------------------------------------------------------------
-- submit_irn: role check now derives from auth.uid(), storage uses auth.uid()
-- ---------------------------------------------------------------------
create or replace function public.submit_irn(
  p_grn_id uuid, p_component_id uuid, p_qty numeric, p_unit_cost numeric,
  p_po_line_id uuid, p_project_id uuid, p_piece_count numeric, p_piece_length numeric,
  p_piece_width numeric, p_answers jsonb, p_submitter_id uuid,
  p_target_lot_id uuid default null::uuid, p_piece_weight numeric default null::numeric,
  p_jw_line_id uuid default null::uuid
) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
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
        case when v_field.field_type = 'text' then v_ans->>'value' else null end,
        case when v_field.field_type = 'number' then (v_ans->>'value')::numeric else null end,
        case when v_field.field_type in ('choice','checkbox') then v_ans->>'value' else null end,
        v_actor
      );
    end if;
  end loop;

  if v_role in ('admin','team_lead') then
    v_res := public.approve_irn(v_irn, v_actor);
    return v_res || jsonb_build_object('id', v_irn, 'irn_no', v_pno, 'status', 'approved');
  end if;

  return jsonb_build_object('ok', true, 'id', v_irn, 'irn_no', v_pno, 'status', 'pending_approval');
end; $function$;

-- ---------------------------------------------------------------------
-- approve_irn: previously had NO role check at all
-- ---------------------------------------------------------------------
create or replace function public.approve_irn(p_irn_id uuid, p_approver_id uuid, p_remarks text default null::text)
returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_role public.role;
  v_irn record;
  v_line_id uuid;
begin
  v_role := public.auth_role();
  if v_role is null or v_role not in ('admin','team_lead') then
    return jsonb_build_object('error','Only Admin / Team Lead can approve.');
  end if;

  select * into v_irn from public.irns where id = p_irn_id for update;
  if not found then return jsonb_build_object('error','IRN not found'); end if;
  if v_irn.status <> 'pending_approval' then
    return jsonb_build_object('error','IRN is not pending approval (already '||v_irn.status||')');
  end if;

  insert into public.grn_lines(grn_id, component_id, qty_received, po_line_id, project_id, unit_cost, target_lot_id, jw_line_id, created_by)
  values (v_irn.grn_id, v_irn.component_id, v_irn.qty, v_irn.po_line_id, v_irn.project_id, v_irn.unit_cost, v_irn.target_lot_id, v_irn.jw_line_id, v_irn.generated_by)
  returning id into v_line_id;

  if v_irn.piece_count is not null or v_irn.piece_length is not null or v_irn.piece_width is not null or v_irn.piece_weight is not null then
    update public.inventory_lots
       set piece_count = v_irn.piece_count, piece_length = v_irn.piece_length, piece_width = v_irn.piece_width, piece_weight = v_irn.piece_weight
     where grn_line_id = v_line_id;
  end if;

  update public.irns
     set status = 'approved', approved_by = auth.uid(), approved_at = now(), grn_line_id = v_line_id,
         approval_remarks = nullif(trim(p_remarks), '')
   where id = p_irn_id;

  return jsonb_build_object('ok', true, 'grn_line_id', v_line_id);
end; $function$;

-- ---------------------------------------------------------------------
-- reject_irn: previously had NO role check at all
-- ---------------------------------------------------------------------
create or replace function public.reject_irn(p_irn_id uuid, p_approver_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare v_role public.role;
begin
  v_role := public.auth_role();
  if v_role is null or v_role not in ('admin','team_lead') then
    return jsonb_build_object('error','Only Admin / Team Lead can reject.');
  end if;

  update public.irns
     set status = 'rejected', approved_by = auth.uid(), approved_at = now(), rejection_reason = p_reason
   where id = p_irn_id and status = 'pending_approval';
  if not found then return jsonb_build_object('error','IRN not pending approval'); end if;
  return jsonb_build_object('ok', true);
end; $function$;

-- ---------------------------------------------------------------------
-- approve_po_line / reject_po_line: role lookup now keyed on auth.uid()
-- ---------------------------------------------------------------------
create or replace function public.approve_po_line(p_line_id uuid, p_approver_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare v_role public.role;
begin
  v_role := public.auth_role();
  if v_role is distinct from 'admin' then
    return jsonb_build_object('error', 'Only Admin can approve a PO line price.');
  end if;

  perform set_config('yaha.po_line_approval_bypass', 'on', true);
  update public.po_lines
     set approval_status = 'approved', approved_by = auth.uid(), approved_at = now(), rejection_reason = null
   where id = p_line_id and approval_status = 'pending_approval';
  if not found then return jsonb_build_object('error', 'Line not pending approval'); end if;
  return jsonb_build_object('ok', true);
end; $function$;

create or replace function public.reject_po_line(p_line_id uuid, p_approver_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare v_role public.role;
begin
  v_role := public.auth_role();
  if v_role is distinct from 'admin' then
    return jsonb_build_object('error', 'Only Admin can reject a PO line price.');
  end if;

  perform set_config('yaha.po_line_approval_bypass', 'on', true);
  update public.po_lines
     set approval_status = 'rejected', approved_by = auth.uid(), approved_at = now(), rejection_reason = p_reason
   where id = p_line_id and approval_status = 'pending_approval';
  if not found then return jsonb_build_object('error', 'Line not pending approval'); end if;
  return jsonb_build_object('ok', true);
end; $function$;

-- ---------------------------------------------------------------------
-- resubmit_irn: no change needed — it delegates to submit_irn, which now
-- enforces its own role check against the real session.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- create_site_purchase: previously had NO role check at all
-- ---------------------------------------------------------------------
create or replace function public.create_site_purchase(
  p_project uuid, p_component uuid, p_qty numeric, p_unit_cost numeric,
  p_vendor uuid, p_vendor_name text, p_note text, p_user_id uuid
) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_role     public.role;
  v_actor    uuid := auth.uid();
  v_bom      record;
  v_bomline  uuid;
  v_lot      uuid;
  v_code     text;
  v_purchase uuid;
  v_pno      text;
  v_comp     record;
  v_proj     record;
  v_buyer    text;
begin
  v_role := public.auth_role();
  if v_role is null or v_role not in ('admin','team_lead','team_member') then
    return jsonb_build_object('error','Not authorized to log a site purchase.');
  end if;

  if p_qty is null or p_qty <= 0 then
    return jsonb_build_object('error','Quantity must be positive');
  end if;
  if p_component is null then
    return jsonb_build_object('error','Pick a component');
  end if;

  select b.id, b.status into v_bom from public.boms b where b.project_id = p_project;
  if v_bom.id is null or v_bom.status is distinct from 'approved' then
    return jsonb_build_object('error','Approve the BOM before logging a site purchase.');
  end if;

  select * into v_comp from public.components where id = p_component;
  select project_no into v_proj from public.projects where id = p_project;
  select full_name into v_buyer from public.profiles where id = v_actor;

  v_code := 'SP-' || to_char(now(),'YYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,8);
  insert into public.inventory_lots(lot_code, component_id, vendor_id, project_id,
        qty_on_hand, qty_initial, unit_cost, is_serialized, status, created_by)
  values (v_code, p_component, p_vendor, p_project, 0, p_qty, p_unit_cost,
        coalesce(v_comp.is_serialized,false), 'open', v_actor)
  returning id into v_lot;

  insert into public.stock_movements(lot_id, component_id, movement_type, qty, project_id,
        reference_type, performed_by, created_by)
  values (v_lot, p_component, 'receipt', p_qty, p_project, 'site_purchase', v_actor, v_actor);
  insert into public.stock_movements(lot_id, component_id, movement_type, qty, project_id,
        reference_type, performed_by, created_by)
  values (v_lot, p_component, 'issue', -p_qty, p_project, 'site_purchase', v_actor, v_actor);

  select bl.id into v_bomline from public.bom_lines bl
    where bl.bom_id = v_bom.id and bl.component_id = p_component limit 1;
  if v_bomline is null then
    insert into public.bom_lines(bom_id, component_id, required_qty, source, note, created_by)
    values (v_bom.id, p_component, p_qty, 'site_purchase', 'Added via site purchase', v_actor)
    returning id into v_bomline;
  end if;

  select public.next_site_purchase_no() into v_pno;
  insert into public.site_purchases(purchase_no, project_id, component_id, qty, unit_cost,
        vendor_id, vendor_name, note, lot_id, bom_line_id, created_by)
  values (v_pno, p_project, p_component, p_qty, p_unit_cost, p_vendor, p_vendor_name, p_note,
        v_lot, v_bomline, v_actor)
  returning id into v_purchase;

  insert into public.notifications(type, project_id, message, link_path, created_by)
  values ('site_purchase', p_project,
    format('%s logged a site purchase on %s: %s x %s%s',
      coalesce(v_buyer, 'Someone'),
      coalesce(v_proj.project_no, 'a project'),
      p_qty,
      coalesce(v_comp.name, 'a component'),
      case when p_vendor_name is not null and length(trim(p_vendor_name)) > 0
           then ' from ' || p_vendor_name else '' end),
    '/projects/' || p_project, v_actor);

  return jsonb_build_object('ok', true, 'id', v_purchase, 'purchase_no', v_pno);
end; $function$;

-- ---------------------------------------------------------------------
-- receive_job_work: previously had NO role check at all
-- ---------------------------------------------------------------------
create or replace function public.receive_job_work(
  p_grn_id uuid, p_line_id uuid, p_qty numeric, p_user_id uuid, p_answers jsonb default null::jsonb
) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_role    public.role;
  v_actor   uuid := auth.uid();
  v_grn     record;
  v_line    record;
  v_order   record;
  v_comp    record;
  v_raw     record;
  v_rate    numeric;
  v_cost    numeric;
  v_line_id uuid;
  v_res     jsonb;
begin
  v_role := public.auth_role();
  if v_role is null or v_role not in ('admin','team_lead','team_member') then
    return jsonb_build_object('error','Not authorized to receive job work.');
  end if;

  select * into v_grn from public.grns where id = p_grn_id;
  if not found then return jsonb_build_object('error','GRN not found'); end if;
  if not v_grn.is_job_work then return jsonb_build_object('error','This GRN is not a job-work GRN'); end if;

  select * into v_line from public.job_work_lines where id = p_line_id for update;
  if not found then return jsonb_build_object('error','Job-work line not found'); end if;
  select * into v_order from public.job_work_orders where id = v_line.jw_order_id for update;
  if v_order.status not in ('sent','partial') then
    return jsonb_build_object('error','Order must be dispatched before receiving');
  end if;
  if v_order.vendor_id is distinct from v_grn.vendor_id then
    return jsonb_build_object('error','This job-work line belongs to a different vendor than the GRN');
  end if;
  if p_qty is null or p_qty <= 0 then return jsonb_build_object('error','Quantity must be positive'); end if;
  if coalesce(v_line.qty_returned,0) + p_qty > v_line.qty_sent then
    return jsonb_build_object('error','Cannot receive more than was dispatched');
  end if;

  select * into v_comp from public.components where id = v_line.component_id;
  select * into v_raw  from public.inventory_lots where id = v_line.raw_lot_id;
  v_rate := coalesce(v_line.jw_rate, v_comp.jw_rate, 0);
  v_cost := coalesce(v_raw.unit_cost, 0) + v_rate;

  if v_comp.inspection_template_id is null then
    insert into public.grn_lines(grn_id, component_id, qty_received, project_id, unit_cost, jw_line_id, created_by)
    values (p_grn_id, v_line.component_id, p_qty, v_order.project_id, v_cost, p_line_id, v_actor)
    returning id into v_line_id;
    return jsonb_build_object('ok', true, 'grn_line_id', v_line_id, 'irn_status', null);
  end if;

  v_res := public.submit_irn(p_grn_id, v_line.component_id, p_qty, v_cost,
    null, v_order.project_id, null, null, null,
    p_answers, v_actor, null, null, p_line_id);
  return v_res;
end; $function$;

-- ---------------------------------------------------------------------
-- dispatch_job_work: previously had NO role check at all
-- ---------------------------------------------------------------------
create or replace function public.dispatch_job_work(p_order_id uuid, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_role  public.role;
  v_actor uuid := auth.uid();
  v_order record;
  v_line  record;
  v_lot   record;
begin
  v_role := public.auth_role();
  if v_role is null or v_role not in ('admin','team_lead') then
    return jsonb_build_object('error','Not authorized to dispatch job work.');
  end if;

  select * into v_order from public.job_work_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('error','Order not found'); end if;
  if v_order.status <> 'draft' then
    return jsonb_build_object('error','Only draft orders can be dispatched');
  end if;

  for v_line in select * from public.job_work_lines where jw_order_id = p_order_id loop
    if v_line.raw_lot_id is null then
      raise exception 'JOB_WORK: a line has no raw lot selected';
    end if;
    select * into v_lot from public.inventory_lots where id = v_line.raw_lot_id for update;
    if coalesce(v_lot.qty_on_hand,0) < v_line.qty_sent then
      raise exception 'JOB_WORK: raw lot % has only % (need %)', v_lot.lot_code, v_lot.qty_on_hand, v_line.qty_sent;
    end if;
    insert into public.stock_movements(
      lot_id, component_id, movement_type, qty, project_id,
      reference_type, reference_id, performed_by, created_by)
    values (v_line.raw_lot_id, v_line.component_id, 'issue', -v_line.qty_sent, v_order.project_id,
      'job_work', p_order_id, v_actor, v_actor);
  end loop;

  update public.job_work_orders set status='sent', sent_date=current_date where id = p_order_id;
  return jsonb_build_object('ok', true);
end; $function$;

-- ---------------------------------------------------------------------
-- Lock the public API surface down: logged-out visitors ("anon") never
-- legitimately call any of these — the app always calls as "authenticated".
-- Idempotent (a REVOKE of an already-absent grant is a no-op) so this is
-- safe to run even for functions that already had anon revoked.
-- ---------------------------------------------------------------------
revoke execute on function public.submit_irn(uuid, uuid, numeric, numeric, uuid, uuid, numeric, numeric, numeric, jsonb, uuid, uuid, numeric, uuid) from anon, public;
grant  execute on function public.submit_irn(uuid, uuid, numeric, numeric, uuid, uuid, numeric, numeric, numeric, jsonb, uuid, uuid, numeric, uuid) to authenticated;

revoke execute on function public.approve_irn(uuid, uuid, text) from anon, public;
grant  execute on function public.approve_irn(uuid, uuid, text) to authenticated;

revoke execute on function public.reject_irn(uuid, uuid, text) from anon, public;
grant  execute on function public.reject_irn(uuid, uuid, text) to authenticated;

revoke execute on function public.resubmit_irn(uuid, jsonb, uuid) from anon, public;
grant  execute on function public.resubmit_irn(uuid, jsonb, uuid) to authenticated;

revoke execute on function public.approve_po_line(uuid, uuid) from anon, public;
grant  execute on function public.approve_po_line(uuid, uuid) to authenticated;

revoke execute on function public.reject_po_line(uuid, uuid, text) from anon, public;
grant  execute on function public.reject_po_line(uuid, uuid, text) to authenticated;

revoke execute on function public.create_site_purchase(uuid, uuid, numeric, numeric, uuid, text, text, uuid) from anon, public;
grant  execute on function public.create_site_purchase(uuid, uuid, numeric, numeric, uuid, text, text, uuid) to authenticated;

revoke execute on function public.receive_job_work(uuid, uuid, numeric, uuid, jsonb) from anon, public;
grant  execute on function public.receive_job_work(uuid, uuid, numeric, uuid, jsonb) to authenticated;

revoke execute on function public.dispatch_job_work(uuid, uuid) from anon, public;
grant  execute on function public.dispatch_job_work(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- job_work_orders / job_work_lines: SELECT/ALL policies were scoped to
-- role "public" (anon + authenticated) instead of "authenticated" like
-- every other table — rescoping only, qual/with_check unchanged.
-- ---------------------------------------------------------------------
alter policy jwo_sel on public.job_work_orders to authenticated;
alter policy jwo_mod on public.job_work_orders to authenticated;
alter policy jwl_sel on public.job_work_lines to authenticated;
alter policy jwl_mod on public.job_work_lines to authenticated;
