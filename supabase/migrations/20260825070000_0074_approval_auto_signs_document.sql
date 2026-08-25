-- Approving is the same act as signing for the configured approver — they
-- shouldn't have to approve a price/QC line AND separately go open the
-- document to sign it. Both approve_po_line and approve_irn now also call
-- _record_signature with the same signature the approver just picked. This
-- is always best-effort (perform, result discarded): if it's not actually
-- their turn to sign yet (e.g. slot 1/creator hasn't signed), the approval
-- itself still succeeds — only the bonus auto-sign is skipped, and the
-- document's own Sign button remains as the fallback path.

-- ---- approve_po_line: also signs the PO document ----
create or replace function public.approve_po_line(p_line_id uuid, p_signature_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_role public.role;
  v_configured uuid;
  v_img text;
  v_po_id uuid;
begin
  select role into v_role from public.profiles where id = p_actor;
  select user_id into v_configured from public.approval_rights where document_type = 'po' and approver_order = 2;

  if v_configured is not null then
    if p_actor <> v_configured then
      return jsonb_build_object('error', 'You are not the configured PO approver.');
    end if;
  else
    if v_role is distinct from 'admin' then
      return jsonb_build_object('error', 'Only Admin can approve a PO line price (no PO approver configured yet).');
    end if;
  end if;

  select image_data_url into v_img from public.signatures where id = p_signature_id and user_id = p_actor;
  if not found then
    return jsonb_build_object('error', 'Signature not found.');
  end if;

  select po_id into v_po_id from public.po_lines where id = p_line_id;

  perform set_config('yaha.po_line_approval_bypass', 'on', true);
  update public.po_lines
     set approval_status = 'approved', approved_by = p_actor, approved_at = now(),
         rejection_reason = null, approval_signature_data_url = v_img
   where id = p_line_id and approval_status = 'pending_approval';
  if not found then return jsonb_build_object('error', 'Line not pending approval'); end if;

  if v_po_id is not null then
    perform public._record_signature('po', v_po_id, p_signature_id, p_actor);
  end if;

  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.approve_po_line(uuid, uuid, uuid) from public, anon;
grant execute on function public.approve_po_line(uuid, uuid, uuid) to authenticated;

-- ---- approve_irn: now requires a signature, and also signs the GRN document ----
drop function if exists public.approve_irn(uuid, uuid, text);

create or replace function public.approve_irn(p_irn_id uuid, p_approver_id uuid, p_signature_id uuid, p_remarks text default null::text)
returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
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

  perform public._record_signature('grn', v_irn.grn_id, p_signature_id, auth.uid());

  return jsonb_build_object('ok', true, 'grn_line_id', v_line_id);
end; $function$;
revoke all on function public.approve_irn(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.approve_irn(uuid, uuid, uuid, text) to authenticated;
