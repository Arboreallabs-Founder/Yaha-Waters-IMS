-- ============================================================
-- 0067 — dispatch_job_work now refuses to dispatch a line that has no
-- resolvable job-work rate (neither the line's own jw_rate nor the
-- component's default jw_rate is set). Without this, receive_job_work
-- silently falls back to a rate of 0, understating job-work cost with
-- no warning anywhere. addJwLine already gets a matching check at
-- add-time (application layer); this is the DB-level backstop so it
-- also covers raiseJobWorkFromProject, which inserts job_work_lines
-- directly and bypasses addJwLine entirely.
-- ============================================================

create or replace function public.dispatch_job_work(p_order_id uuid, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_role  public.role;
  v_actor uuid := auth.uid();
  v_order record;
  v_line  record;
  v_lot   record;
  v_comp  record;
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
    select * into v_comp from public.components where id = v_line.component_id;
    if coalesce(v_line.jw_rate, v_comp.jw_rate) is null then
      raise exception 'JOB_WORK: % has no job-work rate set — add a rate on the line or in Masters', coalesce(v_comp.component_no, 'component');
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
