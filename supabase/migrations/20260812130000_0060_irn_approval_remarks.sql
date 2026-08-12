-- ============================================================
-- 0060 — Optional approver remarks on IRN approval, surfaced on the GRN
-- print (below the line items table; blank if never filled in).
-- ============================================================

alter table public.irns add column approval_remarks text;

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
     set status = 'approved', approved_by = p_approver_id, approved_at = now(), grn_line_id = v_line_id,
         approval_remarks = nullif(trim(p_remarks), '')
   where id = p_irn_id;

  return jsonb_build_object('ok', true, 'grn_line_id', v_line_id);
end; $$;
grant execute on function public.approve_irn(uuid, uuid, text) to authenticated;
