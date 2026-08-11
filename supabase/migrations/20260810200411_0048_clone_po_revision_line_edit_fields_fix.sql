-- ============================================================
-- 0048 — Fix: clone_po_revision's 'update' branch hardcoded the target
-- line's project_id/expected_date to carry over from the OLD line,
-- ignoring whatever the caller submitted for those fields in p_patch.
-- Since updatePoLine always submits the full edited line (not just the
-- fields that triggered revisioning), a project_id/expected_date change
-- submitted alongside a rate/qty/component change was being silently
-- dropped on the new revision. Now sourced from p_patch, matching how
-- component_id/qty_ordered are already handled.
-- ============================================================

create or replace function public.clone_po_revision(
  p_old_po_id uuid, p_kind text, p_line_id uuid, p_patch jsonb, p_actor uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role       public.role;
  v_old        record;
  v_root_id    uuid;
  v_root_po_no text;
  v_new_id     uuid;
  v_new_revno  int;
  v_new_po_no  text;
  v_line       record;
begin
  select role into v_role from public.profiles where id = p_actor;
  if v_role not in ('admin','team_lead') then
    return jsonb_build_object('error','Only Admin / Team Lead can edit a sent PO.');
  end if;

  select * into v_old from public.purchase_orders where id = p_old_po_id;
  if not found then return jsonb_build_object('error','PO not found.'); end if;
  if v_old.status <> 'sent' then
    return jsonb_build_object('error','This PO can no longer be edited.');
  end if;

  v_root_id := coalesce(v_old.root_po_id, v_old.id);
  select po_no into v_root_po_no from public.purchase_orders where id = v_root_id;

  select coalesce(max(revision_no), 0) + 1 into v_new_revno
    from public.purchase_orders
   where id = v_root_id or root_po_id = v_root_id;

  v_new_po_no := v_root_po_no || 'R' || v_new_revno;

  insert into public.purchase_orders
    (po_no, vendor_id, po_date, status, is_informal, source,
     delivery_terms, payment_terms, freight_terms, gst_percent,
     root_po_id, revision_no, created_by)
  values (
    v_new_po_no,
    case when p_kind = 'header_vendor' then (p_patch->>'vendor_id')::uuid else v_old.vendor_id end,
    v_old.po_date, 'sent', v_old.is_informal, v_old.source,
    v_old.delivery_terms, v_old.payment_terms, v_old.freight_terms, v_old.gst_percent,
    v_root_id, v_new_revno, p_actor
  )
  returning id into v_new_id;

  for v_line in select * from public.po_lines where po_id = p_old_po_id loop
    if p_kind = 'remove' and v_line.id = p_line_id then
      continue;
    end if;

    if p_kind = 'update' and v_line.id = p_line_id then
      perform set_config('yaha.po_line_approval_bypass', 'off', true);
      insert into public.po_lines
        (po_id, component_id, project_id, requisition_line_id, qty_ordered, rate, amount, expected_date, created_by)
      values (
        v_new_id,
        coalesce((p_patch->>'component_id')::uuid, v_line.component_id),
        nullif(p_patch->>'project_id','')::uuid,
        v_line.requisition_line_id,
        coalesce((p_patch->>'qty_ordered')::numeric, v_line.qty_ordered),
        (p_patch->>'rate')::numeric,
        (p_patch->>'amount')::numeric,
        nullif(p_patch->>'expected_date','')::date,
        p_actor
      );
    else
      perform set_config('yaha.po_line_approval_bypass', 'on', true);
      insert into public.po_lines
        (po_id, component_id, project_id, requisition_line_id, qty_ordered, rate, amount, expected_date,
         approval_status, approved_by, approved_at, rejection_reason, created_by)
      values (
        v_new_id, v_line.component_id, v_line.project_id, v_line.requisition_line_id,
        v_line.qty_ordered, v_line.rate, v_line.amount, v_line.expected_date,
        v_line.approval_status, v_line.approved_by, v_line.approved_at, v_line.rejection_reason, p_actor
      );
    end if;
  end loop;

  if p_kind = 'add' then
    perform set_config('yaha.po_line_approval_bypass', 'off', true);
    insert into public.po_lines
      (po_id, component_id, project_id, qty_ordered, rate, amount, expected_date, created_by)
    values (
      v_new_id, (p_patch->>'component_id')::uuid, nullif(p_patch->>'project_id','')::uuid,
      (p_patch->>'qty_ordered')::numeric, (p_patch->>'rate')::numeric, (p_patch->>'amount')::numeric,
      nullif(p_patch->>'expected_date','')::date, p_actor
    );
  end if;

  perform set_config('yaha.po_line_approval_bypass', 'off', true);

  update public.po_lines set line_status = 'cancelled' where po_id = p_old_po_id;

  update public.purchase_orders
     set total_amount = (select coalesce(sum(amount), 0) from public.po_lines where po_id = v_new_id)
   where id = v_new_id;

  update public.purchase_orders
     set status = 'superseded', superseded_by = v_new_id
   where id = p_old_po_id;

  return jsonb_build_object('ok', true, 'id', v_new_id, 'po_no', v_new_po_no);
end; $$;
