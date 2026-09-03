-- A revised PO (R1/R2/…) was being born already `sent` with zero signatures.
-- Consequences:
--   * `getSigningState` sees it as post-"sent" + unsigned → treats it as a
--     pre-feature *backfill* ("sign for the record, won't change status"),
--     so nobody is actually prompted to sign it and it never reaches the
--     approver's "Awaiting your signature" tab (that tab filters
--     status = 'pending_signature').
--   * The print page blocks on `fullySigned`, so the revision can never be
--     printed — it just sits half-signed forever.
--
-- Fix: a revision now enters the world exactly like a fresh PO — status
-- 'draft', no signatures — and goes through the normal
-- draft → (Sign & Send) → pending_signature → (approver signs) → sent chain.
--
-- Part 2 (one-time) catches up the revisions already stuck in the old
-- behaviour: any non-superseded revision still 'sent' but not fully signed is
-- moved to 'pending_signature', and the next required signer is notified
-- (the notifications-insert trigger from 0083 fans that out to web push).

-- 1. clone_po_revision — the only change vs. the live definition is the new
--    revision's status: 'sent' → 'draft'.
create or replace function public.clone_po_revision(p_old_po_id uuid, p_kind text, p_line_id uuid, p_patch jsonb, p_actor uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  v_target     record;
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

  -- Pre-flight validation of the targeted line, BEFORE any row is written —
  -- a rejected edit must leave zero side effects.
  if p_kind in ('remove','update') then
    select * into v_target from public.po_lines where id = p_line_id and po_id = p_old_po_id;
    if not found then return jsonb_build_object('error','Line not found.'); end if;

    if p_kind = 'remove' and v_target.qty_received > 0 then
      return jsonb_build_object('error','Cannot remove a line that already has receipts against it — reduce the ordered quantity instead.');
    end if;

    if p_kind = 'update' and v_target.qty_received > 0 then
      if coalesce((p_patch->>'qty_ordered')::numeric, v_target.qty_ordered) < v_target.qty_received then
        return jsonb_build_object('error', format('Cannot set ordered quantity below what has already been received (%s).', v_target.qty_received));
      end if;
      if (p_patch->>'component_id') is not null and (p_patch->>'component_id')::uuid <> v_target.component_id then
        return jsonb_build_object('error','Cannot change the component on a line that already has receipts — remove and re-add a fresh line instead.');
      end if;
    end if;
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
    v_old.po_date, 'draft', v_old.is_informal, v_old.source,
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
end; $function$;

-- 2. One-time catch-up for revisions already stuck 'sent' + unsigned.
with stuck as (
  select po.id, po.created_by
  from public.purchase_orders po
  where po.status = 'sent'
    and po.revision_no > 0
    and po.superseded_by is null
    and not public.document_fully_signed('po', po.id)
),
moved as (
  update public.purchase_orders po
     set status = 'pending_signature'
    from stuck
   where po.id = stuck.id
  returning po.id, po.created_by
),
next_signer as (
  select m.id as po_id,
         m.created_by,
         ns.slot,
         case when ns.slot = 1 then m.created_by
              else (select ar.user_id from public.approval_rights ar
                     where ar.document_type = 'po' and ar.approver_order = ns.slot)
         end as recipient_id
  from moved m
  cross join lateral (
    select min(s)::int as slot
    from unnest(
      array[1::smallint] ||
      coalesce((select array_agg(approver_order) from public.approval_rights where document_type = 'po'), array[]::smallint[])
    ) as s
    where s <> all (
      coalesce((select array_agg(slot) from public.document_signatures
                 where document_type = 'po' and document_id = m.id), array[]::smallint[])
    )
  ) ns
)
insert into public.notifications (type, message, link_path, created_by, recipient_id)
select 'signature_required',
       'Your signature is needed on a purchase order.',
       '/purchase-orders/' || po_id,
       created_by,
       recipient_id
from next_signer ns
where recipient_id is not null
  and not exists (
    select 1 from public.notifications n
    where n.type = 'signature_required'
      and n.link_path = '/purchase-orders/' || ns.po_id
      and n.recipient_id = ns.recipient_id
  );
