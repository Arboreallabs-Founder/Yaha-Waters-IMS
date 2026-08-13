-- ============================================================
-- 0064 — Job-work receiving moves to the GRN page's "New GRN" flow.
--
-- 0063 made job-work receiving create a real GRN, but the entry point
-- stayed on the Job-Work order page, and each receive created its own
-- new GRN header (one order = one GRN, via grns.jw_order_id). That
-- doesn't match a normal GRN's shape: a GRN is picked up at the gate
-- for a VENDOR, and can carry lines against several different open
-- orders from that vendor as you go — exactly how PO-based GRNs
-- already work (grns has no po_id; each grn_line points at its own
-- po_line_id).
--
-- This migration:
--   - replaces grns.jw_order_id with a plain grns.is_job_work flag —
--     the type is chosen once at GRN creation (mirrors the new
--     "Job Work" vs "Purchase" choice in the New GRN dialog), while
--     each grn_lines.jw_line_id (already added in 0063) carries the
--     specific job-work line, same as po_line_id does for POs.
--   - rewrites receive_job_work() to receive AGAINST an existing GRN
--     (p_grn_id) instead of creating its own — the New GRN flow now
--     owns GRN-header creation, exactly like it already does for
--     PO-based receiving.
--
-- grn_line_after_insert()'s job-work branch, and the jw_line_id
-- threading through submit_irn/approve_irn/resubmit_irn, are untouched
-- — they never cared how the grn row came to exist.
-- ============================================================

alter table public.grns drop column jw_order_id;
alter table public.grns add column is_job_work boolean not null default false;

drop function if exists public.receive_job_work(uuid, numeric, uuid, text, jsonb);

create or replace function public.receive_job_work(
  p_grn_id uuid, p_line_id uuid, p_qty numeric, p_user_id uuid,
  p_answers jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
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
    values (p_grn_id, v_line.component_id, p_qty, v_order.project_id, v_cost, p_line_id, p_user_id)
    returning id into v_line_id;
    return jsonb_build_object('ok', true, 'grn_line_id', v_line_id, 'irn_status', null);
  end if;

  v_res := public.submit_irn(p_grn_id, v_line.component_id, p_qty, v_cost,
    null, v_order.project_id, null, null, null,
    p_answers, p_user_id, null, null, p_line_id);
  return v_res;
end; $$;
revoke execute on function public.receive_job_work(uuid, uuid, numeric, uuid, jsonb) from anon, public;
grant execute on function public.receive_job_work(uuid, uuid, numeric, uuid, jsonb) to authenticated;
