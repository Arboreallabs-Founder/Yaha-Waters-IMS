-- Editing a PO that's waiting for approval.
--
-- While a PO is 'pending_signature' its creator (and only its creator) can
-- still change it, in place — no revision, since the vendor hasn't seen it.
-- Any real change keeps the creator's own signature (slot 1) but removes the
-- approvers' (slot 2+), so the chain restarts at approver 2 and nobody's
-- signature stays on something they didn't see. Whoever loses a signature is
-- told to sign again.
--
-- Done in triggers so it happens in the same transaction as the edit and
-- can't be skipped. Signing (status → sent) and price approval
-- (yaha.po_line_approval_bypass) don't count as edits.

-- Lines of a pending PO: creator only. Draft/sent as before.
drop policy poline_mod on public.po_lines;
create policy poline_mod on public.po_lines for all to authenticated
  using (
    public.auth_role() = any (array['admin'::public.role, 'team_lead'::public.role])
    and exists (
      select 1 from public.purchase_orders po
       where po.id = po_lines.po_id
         and (po.status = any (array['draft'::public.po_status, 'sent'::public.po_status])
              or (po.status = 'pending_signature' and po.created_by = auth.uid())))
  )
  with check (
    public.auth_role() = any (array['admin'::public.role, 'team_lead'::public.role])
    and exists (
      select 1 from public.purchase_orders po
       where po.id = po_lines.po_id
         and (po.status = any (array['draft'::public.po_status, 'sent'::public.po_status])
              or (po.status = 'pending_signature' and po.created_by = auth.uid())))
  );

-- Remove a pending PO's approver signatures and tell each of those signers.
create or replace function public._reset_po_approver_signatures(p_po_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_po_no text;
begin
  select po_no into v_po_no from public.purchase_orders where id = p_po_id;
  with removed as (
    delete from public.document_signatures
     where document_type = 'po' and document_id = p_po_id and slot > 1
    returning user_id
  )
  insert into public.notifications(type, message, link_path, created_by, recipient_id)
  select distinct 'signature_required',
         format('PO %s was changed after you signed — it needs your signature again.', v_po_no),
         '/purchase-orders/' || p_po_id, auth.uid(), r.user_id
    from removed r
   where r.user_id is distinct from auth.uid();
end;
$function$;

revoke all on function public._reset_po_approver_signatures(uuid) from public, anon, authenticated;

create or replace function public.po_lines_reset_pending_approvals()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_po_id uuid := coalesce(new.po_id, old.po_id);
begin
  if coalesce(current_setting('yaha.po_line_approval_bypass', true), '') = 'on' then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and new.component_id is not distinct from old.component_id
     and new.qty_ordered  is not distinct from old.qty_ordered
     and new.rate         is not distinct from old.rate
     and new.amount       is not distinct from old.amount
     and new.project_id   is not distinct from old.project_id
     and new.expected_date is not distinct from old.expected_date then
    return null;
  end if;
  if exists (select 1 from public.purchase_orders where id = v_po_id and status = 'pending_signature') then
    perform public._reset_po_approver_signatures(v_po_id);
  end if;
  return null;
end;
$function$;

create trigger trg_po_lines_reset_pending_approvals
  after insert or update or delete on public.po_lines
  for each row execute function public.po_lines_reset_pending_approvals();

create or replace function public.purchase_orders_pending_edit()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if old.status <> 'pending_signature' or new.status <> 'pending_signature' then
    return null;
  end if;
  if new.po_no            is not distinct from old.po_no
     and new.vendor_id        is not distinct from old.vendor_id
     and new.po_date          is not distinct from old.po_date
     and new.delivery_terms   is not distinct from old.delivery_terms
     and new.payment_terms    is not distinct from old.payment_terms
     and new.freight_terms    is not distinct from old.freight_terms
     and new.gst_percent      is not distinct from old.gst_percent
     and new.delivery_address is not distinct from old.delivery_address
     and new.terms_conditions is not distinct from old.terms_conditions then
    return null;
  end if;
  if auth.uid() is not null and auth.uid() is distinct from old.created_by then
    raise exception 'Only the PO''s creator can edit it while it''s waiting for approval.'
      using errcode = 'insufficient_privilege';
  end if;
  perform public._reset_po_approver_signatures(new.id);
  return null;
end;
$function$;

create trigger trg_purchase_orders_pending_edit
  after update on public.purchase_orders
  for each row execute function public.purchase_orders_pending_edit();
