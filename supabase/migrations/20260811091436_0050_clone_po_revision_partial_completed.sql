-- ============================================================
-- 0050 — Extend clone_po_revision to partial/completed POs.
--
-- Previously only a 'sent' PO (nothing received yet) could be edited.
-- Now 'partial'/'completed' POs can be edited too, reusing the exact same
-- revision-clone + price-approval-gate machinery — Admin/Founder edits
-- apply immediately, Team Lead edits on the touched line sit
-- pending_approval same as always. cancelled/superseded stay locked.
--
-- The new wrinkle: a partial/completed PO's lines have real GRN receipts
-- against them (grn_lines.po_line_id -> po_lines.id, qty_received
-- trigger-maintained by rollup_po_line()). Cloning a line now re-points
-- its existing grn_lines onto the new line, so rollup_po_line() recomputes
-- the new line's qty_received/line_status correctly (and cascades into
-- recompute_po_status promoting the new PO to partial/completed on its
-- own) instead of the new revision silently looking like nothing has
-- arrived. This is a no-op for the old sent-only case (no receipts exist
-- yet), so existing behavior is unchanged there.
--
-- Two new guards protect the physical-goods reality this introduces:
-- removing a line that already has receipts, or reducing its ordered qty
-- below what's already received, or swapping its component, are all
-- rejected — none of those make sense once real goods have arrived
-- against a specific line/component.
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
  v_new_line_id uuid;
begin
  select role into v_role from public.profiles where id = p_actor;
  if v_role not in ('admin','team_lead') then
    return jsonb_build_object('error','Only Admin / Team Lead can edit this PO.');
  end if;

  select * into v_old from public.purchase_orders where id = p_old_po_id;
  if not found then return jsonb_build_object('error','PO not found.'); end if;
  if v_old.status not in ('sent','partial','completed') then
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
      if v_line.qty_received > 0 then
        return jsonb_build_object('error','Cannot remove a line that already has receipts against it — reduce the ordered quantity instead.');
      end if;
      continue;
    end if;

    if p_kind = 'update' and v_line.id = p_line_id then
      if v_line.qty_received > 0 then
        if coalesce((p_patch->>'qty_ordered')::numeric, v_line.qty_ordered) < v_line.qty_received then
          return jsonb_build_object('error', format('Cannot set ordered quantity below what has already been received (%s).', v_line.qty_received));
        end if;
        if (p_patch->>'component_id') is not null and (p_patch->>'component_id')::uuid <> v_line.component_id then
          return jsonb_build_object('error','Cannot change the component on a line that already has receipts — remove and re-add a fresh line instead.');
        end if;
      end if;
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
      )
      returning id into v_new_line_id;
    else
      perform set_config('yaha.po_line_approval_bypass', 'on', true);
      insert into public.po_lines
        (po_id, component_id, project_id, requisition_line_id, qty_ordered, rate, amount, expected_date,
         approval_status, approved_by, approved_at, rejection_reason, created_by)
      values (
        v_new_id, v_line.component_id, v_line.project_id, v_line.requisition_line_id,
        v_line.qty_ordered, v_line.rate, v_line.amount, v_line.expected_date,
        v_line.approval_status, v_line.approved_by, v_line.approved_at, v_line.rejection_reason, p_actor
      )
      returning id into v_new_line_id;
    end if;

    update public.grn_lines set po_line_id = v_new_line_id where po_line_id = v_line.id;
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

  update public.po_lines set line_status = 'cancelled', qty_received = 0 where po_id = p_old_po_id;

  update public.purchase_orders
     set total_amount = (select coalesce(sum(amount), 0) from public.po_lines where po_id = v_new_id)
   where id = v_new_id;

  update public.purchase_orders
     set status = 'superseded', superseded_by = v_new_id
   where id = p_old_po_id;

  return jsonb_build_object('ok', true, 'id', v_new_id, 'po_no', v_new_po_no);
end; $$;
