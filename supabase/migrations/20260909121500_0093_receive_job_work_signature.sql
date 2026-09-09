-- ============================================================
-- 0093 — Job-work receiving can auto-approve its IRN inline, like PO GRN receiving.
--
-- Since the signature-based IRN approval workflow (0072b), submit_irn() only
-- auto-approves when it's handed a p_signature_id. The PO-based path
-- (submitIrn() in grn/irn-actions.ts) attaches the receiver's saved signature,
-- so an Admin / Team Lead receipt of a templated component completes in one
-- step. receive_job_work() was never updated — it always called submit_irn()
-- with no signature, so every job-work IRN was stuck at 'pending_approval'
-- with no line ever posted (looked like "nothing happened" on the GRN page).
--
-- This adds p_signature_id to receive_job_work() and forwards it to
-- submit_irn(). Everything else is unchanged. Non-templated components still
-- post their grn_line directly (no inspection gate).
-- ============================================================

drop function if exists public.receive_job_work(uuid, uuid, numeric, uuid, jsonb);

create or replace function public.receive_job_work(
  p_grn_id uuid, p_line_id uuid, p_qty numeric, p_user_id uuid,
  p_answers jsonb default null, p_signature_id uuid default null
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
    p_answers, v_actor, null, null, p_line_id, p_signature_id);
  return v_res;
end; $function$;

revoke execute on function public.receive_job_work(uuid, uuid, numeric, uuid, jsonb, uuid) from anon, public;
grant  execute on function public.receive_job_work(uuid, uuid, numeric, uuid, jsonb, uuid) to authenticated;
