-- ============================================================
-- 0063 — Job-Work receiving goes through GRN (with IRN inspection parity),
-- staying clearly distinguishable from a normal PO-based GRN.
--
-- Today receive_job_work() creates inventory_lots/stock_movements directly,
-- bypassing grns/grn_lines entirely — no GRN history, no IRN inspection gate,
-- even though almost every non-box component (raw and finished alike) has a
-- mandatory inspection checklist since 0056. This migration:
--   - adds jw_order_id (grns) / jw_line_id (grn_lines, irns) so a job-work
--     receipt is a real, but clearly tagged, GRN/IRN.
--   - gives job-work GRNs their own JWGRN/... number series.
--   - moves receive_job_work()'s lot-creation logic into a new branch of
--     grn_line_after_insert(), keyed off jw_line_id instead of a PO line,
--     so lot-creation logic stays single-sourced (same reason approve_irn
--     defers to this trigger instead of duplicating it).
--   - rewrites receive_job_work() to create the GRN header, then either
--     insert the grn_line directly (no inspection template) or submit an
--     IRN (template present) — exactly mirroring normal GRN receiving.
--   - threads jw_line_id through submit_irn/approve_irn/resubmit_irn the
--     same way po_line_id/target_lot_id already are.
-- ============================================================

-- ---- schema: discriminator columns -----------------------------
alter table public.grns add column jw_order_id uuid references public.job_work_orders(id);
alter table public.grn_lines add column jw_line_id uuid references public.job_work_lines(id);
alter table public.irns add column jw_line_id uuid references public.job_work_lines(id);

-- ---- job-work GRN numbering: its own series, JWGRN/... ----------
create sequence if not exists public.seq_jw_grn_no;

create or replace function public.next_jw_grn_no() returns text
  language sql set search_path = public as $$
  select 'JWGRN/' || public.fiscal_year_label() || '/' || lpad(nextval('public.seq_jw_grn_no')::text, 4, '0');
$$;
grant execute on function public.next_jw_grn_no() to authenticated;

-- ============================================================
-- grn_line_after_insert(): new job-work branch, checked first.
-- Mirrors the old receive_job_work()'s lot-creation logic verbatim,
-- reusing the v_track/v_is_ser component lookup already done below.
-- ============================================================
create or replace function public.grn_line_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_track  public.tracking_mode;
  v_is_ser boolean;
  v_is_jw  boolean;
  v_stage  public.jw_stage;
  v_vendor uuid;
  v_lot    uuid;
  v_code   text;
  v_status public.lot_status;
  v_n      int;
  i        int;
  v_jwline     record;
  v_last       uuid;
  v_total_sent numeric;
  v_total_ret  numeric;
begin
  select tracking_mode, is_serialized, is_job_work
    into v_track, v_is_ser, v_is_jw
    from public.components where id = NEW.component_id;
  v_stage  := case when coalesce(v_is_jw, false) then 'raw'::public.jw_stage else null end;
  v_vendor := (select vendor_id from public.grns where id = NEW.grn_id);
  v_status := case when NEW.project_id is not null then 'issued'::public.lot_status else 'open'::public.lot_status end;

  -- (0) Job-work completed-goods receipt: one or more lots produced from a
  -- specific job_work_lines row, parented to the raw lot that was consumed.
  if NEW.jw_line_id is not null then
    select * into v_jwline from public.job_work_lines where id = NEW.jw_line_id;

    if v_track = 'item' and NEW.qty_received = floor(NEW.qty_received)
       and NEW.qty_received > 0 and NEW.qty_received <= 1000 then
      v_n := NEW.qty_received::int;
    else
      v_n := 1;
    end if;

    for i in 1..v_n loop
      v_code := 'LOT-' || to_char(now(), 'YYMMDD') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      insert into public.inventory_lots(
        lot_code, component_id, grn_line_id, vendor_id, project_id, parent_lot_id,
        qty_on_hand, qty_initial, unit_cost, is_serialized, status, jw_stage,
        container_no, created_by)
      values (v_code, NEW.component_id, NEW.id, v_vendor, NEW.project_id, v_jwline.raw_lot_id,
        0, case when v_n > 1 then 1 else NEW.qty_received end, NEW.unit_cost,
        case when v_track = 'item' then true else coalesce(v_is_ser, false) end,
        v_status, 'completed'::public.jw_stage,
        case when v_track = 'box' then v_code else null end, NEW.created_by)
      returning id into v_lot;
      insert into public.stock_movements(
        lot_id, component_id, movement_type, qty, project_id,
        reference_type, reference_id, performed_by, created_by)
      values (v_lot, NEW.component_id, 'receipt', case when v_n > 1 then 1 else NEW.qty_received end, NEW.project_id,
        'grn', NEW.id, NEW.created_by, NEW.created_by);
      v_last := v_lot;
    end loop;

    update public.job_work_lines
       set qty_returned = coalesce(qty_returned, 0) + NEW.qty_received,
           completed_lot_id = v_last
     where id = NEW.jw_line_id;

    select coalesce(sum(qty_sent), 0), coalesce(sum(qty_returned), 0)
      into v_total_sent, v_total_ret
      from public.job_work_lines where jw_order_id = v_jwline.jw_order_id;
    update public.job_work_orders
       set status = case when v_total_ret >= v_total_sent then 'received' else 'partial' end
     where id = v_jwline.jw_order_id;

    return NEW;
  end if;

  -- (a) Add-to-existing-box: no new lot, just a receipt movement into the chosen box.
  if NEW.target_lot_id is not null then
    insert into public.stock_movements(
      lot_id, component_id, movement_type, qty, project_id,
      reference_type, reference_id, performed_by, created_by)
    values (NEW.target_lot_id, NEW.component_id, 'receipt', NEW.qty_received, NEW.project_id,
      'grn', NEW.id, NEW.created_by, NEW.created_by);
    return NEW;
  end if;

  -- (b) Item tracking: one lot (one QR) per physical piece.
  if v_track = 'item' and NEW.qty_received = floor(NEW.qty_received)
     and NEW.qty_received > 0 and NEW.qty_received <= 1000 then
    v_n := NEW.qty_received::int;
    for i in 1..v_n loop
      v_code := 'LOT-' || to_char(now(), 'YYMMDD') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      insert into public.inventory_lots(
        lot_code, component_id, grn_line_id, vendor_id, project_id,
        qty_on_hand, qty_initial, unit_cost, is_serialized, status, jw_stage, created_by)
      values (v_code, NEW.component_id, NEW.id, v_vendor, NEW.project_id,
        0, 1, NEW.unit_cost, true, v_status, v_stage, NEW.created_by)
      returning id into v_lot;
      insert into public.stock_movements(
        lot_id, component_id, movement_type, qty, project_id,
        reference_type, reference_id, performed_by, created_by)
      values (v_lot, NEW.component_id, 'receipt', 1, NEW.project_id,
        'grn', NEW.id, NEW.created_by, NEW.created_by);
    end loop;
    return NEW;
  end if;

  -- (c) Box / bulk (default): one lot for the whole receipt.
  v_code := 'LOT-' || to_char(now(), 'YYMMDD') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  insert into public.inventory_lots(
    lot_code, component_id, grn_line_id, vendor_id, project_id,
    qty_on_hand, qty_initial, unit_cost, is_serialized, status, jw_stage,
    container_no, created_by)
  values (v_code, NEW.component_id, NEW.id, v_vendor, NEW.project_id,
    0, NEW.qty_received, NEW.unit_cost, coalesce(v_is_ser, false), v_status, v_stage,
    case when v_track = 'box' then v_code else null end, NEW.created_by)
  returning id into v_lot;
  insert into public.stock_movements(
    lot_id, component_id, movement_type, qty, project_id,
    reference_type, reference_id, performed_by, created_by)
  values (v_lot, NEW.component_id, 'receipt', NEW.qty_received, NEW.project_id,
    'grn', NEW.id, NEW.created_by, NEW.created_by);
  return NEW;
end; $$;

-- ============================================================
-- submit_irn: thread a job_work_lines reference through, same way
-- po_line_id/target_lot_id already are.
-- ============================================================
drop function if exists public.submit_irn(uuid,uuid,numeric,numeric,uuid,uuid,numeric,numeric,numeric,jsonb,uuid,uuid,numeric);

create or replace function public.submit_irn(
  p_grn_id uuid, p_component_id uuid, p_qty numeric, p_unit_cost numeric,
  p_po_line_id uuid, p_project_id uuid,
  p_piece_count numeric, p_piece_length numeric, p_piece_width numeric,
  p_answers jsonb, p_submitter_id uuid, p_target_lot_id uuid default null,
  p_piece_weight numeric default null, p_jw_line_id uuid default null
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
        piece_count, piece_length, piece_width, piece_weight, target_lot_id, jw_line_id, generated_by, created_by)
  values (v_pno, p_grn_id, p_component_id, v_template, p_qty, p_unit_cost, p_po_line_id, p_project_id,
        p_piece_count, p_piece_length, p_piece_width, p_piece_weight, p_target_lot_id, p_jw_line_id, p_submitter_id, p_submitter_id)
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
grant execute on function public.submit_irn(uuid,uuid,numeric,numeric,uuid,uuid,numeric,numeric,numeric,jsonb,uuid,uuid,numeric,uuid) to authenticated;

-- ============================================================
-- approve_irn: forward jw_line_id into the deferred grn_lines insert.
-- Same 3-arg signature — CREATE OR REPLACE is safe here.
-- ============================================================
create or replace function public.approve_irn(p_irn_id uuid, p_approver_id uuid, p_remarks text default null)
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

  insert into public.grn_lines(grn_id, component_id, qty_received, po_line_id, project_id, unit_cost, target_lot_id, jw_line_id, created_by)
  values (v_irn.grn_id, v_irn.component_id, v_irn.qty, v_irn.po_line_id, v_irn.project_id, v_irn.unit_cost, v_irn.target_lot_id, v_irn.jw_line_id, v_irn.generated_by)
  returning id into v_line_id;

  -- Mirrors addGrnLine()'s post-creation patch for length/area/weight quantity types.
  if v_irn.piece_count is not null or v_irn.piece_length is not null or v_irn.piece_width is not null or v_irn.piece_weight is not null then
    update public.inventory_lots
       set piece_count = v_irn.piece_count, piece_length = v_irn.piece_length, piece_width = v_irn.piece_width, piece_weight = v_irn.piece_weight
     where grn_line_id = v_line_id;
  end if;

  update public.irns
     set status = 'approved', approved_by = p_approver_id, approved_at = now(), grn_line_id = v_line_id,
         approval_remarks = nullif(trim(p_remarks), '')
   where id = p_irn_id;

  return jsonb_build_object('ok', true, 'grn_line_id', v_line_id);
end; $$;

-- ============================================================
-- resubmit_irn: same 3-arg signature (unchanged) — forward jw_line_id
-- into its internal submit_irn call.
-- ============================================================
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
    p_answers, p_submitter_id, v_old.target_lot_id, v_old.piece_weight, v_old.jw_line_id);
  if v_result ? 'error' then return v_result; end if;

  v_new_id := (v_result->>'id')::uuid;
  update public.irns set supersedes_irn_id = p_irn_id where id = v_new_id;
  return v_result;
end; $$;

-- ============================================================
-- receive_job_work: rewritten to create a real (JWGRN-numbered) GRN
-- header, then either insert the grn_line directly (no inspection
-- template on the finished component) or submit an IRN for it — the
-- same fork normal GRN receiving already makes. Lot creation itself
-- now lives in grn_line_after_insert()'s new branch above.
-- ============================================================
drop function if exists public.receive_job_work(uuid, numeric, uuid);

create or replace function public.receive_job_work(
  p_line_id uuid, p_qty numeric, p_user_id uuid,
  p_challan_no text default null, p_answers jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_line    record;
  v_order   record;
  v_comp    record;
  v_raw     record;
  v_rate    numeric;
  v_cost    numeric;
  v_grn_no  text;
  v_grn_id  uuid;
  v_line_id uuid;
  v_res     jsonb;
begin
  select * into v_line from public.job_work_lines where id = p_line_id for update;
  if not found then return jsonb_build_object('error','Job-work line not found'); end if;
  select * into v_order from public.job_work_orders where id = v_line.jw_order_id for update;
  if v_order.status not in ('sent','partial') then
    return jsonb_build_object('error','Order must be dispatched before receiving');
  end if;
  if p_qty is null or p_qty <= 0 then return jsonb_build_object('error','Quantity must be positive'); end if;
  if coalesce(v_line.qty_returned,0) + p_qty > v_line.qty_sent then
    return jsonb_build_object('error','Cannot receive more than was dispatched');
  end if;

  select * into v_comp from public.components where id = v_line.component_id;
  select * into v_raw  from public.inventory_lots where id = v_line.raw_lot_id;
  v_rate := coalesce(v_line.jw_rate, v_comp.jw_rate, 0);
  v_cost := coalesce(v_raw.unit_cost, 0) + v_rate;

  select public.next_jw_grn_no() into v_grn_no;
  insert into public.grns(grn_no, vendor_id, jw_order_id, challan_no, received_by, created_by)
  values (v_grn_no, v_order.vendor_id, v_order.id, nullif(trim(p_challan_no), ''), p_user_id, p_user_id)
  returning id into v_grn_id;

  if v_comp.inspection_template_id is null then
    insert into public.grn_lines(grn_id, component_id, qty_received, project_id, unit_cost, jw_line_id, created_by)
    values (v_grn_id, v_line.component_id, p_qty, v_order.project_id, v_cost, p_line_id, p_user_id)
    returning id into v_line_id;
    return jsonb_build_object('ok', true, 'grn_id', v_grn_id, 'grn_no', v_grn_no, 'grn_line_id', v_line_id, 'irn_status', null);
  end if;

  v_res := public.submit_irn(v_grn_id, v_line.component_id, p_qty, v_cost,
    null, v_order.project_id, null, null, null,
    p_answers, p_user_id, null, null, p_line_id);
  if v_res ? 'error' then return v_res; end if;

  return v_res || jsonb_build_object('grn_id', v_grn_id, 'grn_no', v_grn_no);
end; $$;
revoke execute on function public.receive_job_work(uuid, numeric, uuid, text, jsonb) from anon, public;
grant execute on function public.receive_job_work(uuid, numeric, uuid, text, jsonb) to authenticated;
