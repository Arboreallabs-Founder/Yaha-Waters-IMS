-- Several approvers per signing slot.
--
-- Approval Rights used to allow one person per (document type, slot). A slot
-- can now list several people; whichever of them signs first fills it.
--
-- Two of them signing the same document at the same moment can't both land:
-- _record_signature locks the document row before working out the next slot,
-- so the second signer waits, then sees the slot already filled and gets a
-- plain "already signed by X" instead of a second signature. The existing
-- unique (document_type, document_id, slot) stays as the backstop: a clash
-- there inserts nothing and returns "someone else just signed this step".

alter table public.approval_rights
  drop constraint approval_rights_document_type_approver_order_key;
alter table public.approval_rights
  add constraint approval_rights_document_type_approver_order_user_key
  unique (document_type, approver_order, user_id);

create or replace function public._record_signature(p_document_type text, p_document_id uuid, p_signature_id uuid, p_actor uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_img text;
  v_creator uuid;
  v_link text;
  v_type_label text;
  v_signed_slots smallint[];
  v_required smallint[];
  v_slot smallint;
  v_fully boolean;
  v_next_slot smallint;
  v_signed_by text;
begin
  select image_data_url into v_img from public.signatures where id = p_signature_id and user_id = p_actor;
  if not found then
    return jsonb_build_object('error', 'Signature not found.');
  end if;

  -- Lock the document so concurrent signers queue up behind each other.
  if p_document_type = 'po' then
    select created_by into v_creator from public.purchase_orders where id = p_document_id for update;
    v_link := '/purchase-orders/' || p_document_id; v_type_label := 'purchase order';
  elsif p_document_type = 'grn' then
    select created_by into v_creator from public.grns where id = p_document_id for update;
    v_link := '/grn/' || p_document_id; v_type_label := 'GRN';
  elsif p_document_type = 'job_work' then
    select created_by into v_creator from public.job_work_orders where id = p_document_id for update;
    v_link := '/job-work/' || p_document_id; v_type_label := 'job-work order';
  else
    return jsonb_build_object('error', 'Unknown document type.');
  end if;
  if v_creator is null then
    return jsonb_build_object('error', 'Document not found.');
  end if;

  select coalesce(array_agg(slot), array[]::smallint[]) into v_signed_slots
    from public.document_signatures where document_type = p_document_type and document_id = p_document_id;

  select array(
    select distinct s from unnest(
      array[1::smallint] ||
      coalesce((select array_agg(approver_order) from public.approval_rights where document_type = p_document_type), array[]::smallint[])
    ) as s order by s
  ) into v_required;

  select min(s) into v_slot from unnest(v_required) as s where s <> all(v_signed_slots);

  -- An approver whose slot someone else already filled.
  if v_slot is null or (v_slot > 1 and not exists (
       select 1 from public.approval_rights
        where document_type = p_document_type and approver_order = v_slot and user_id = p_actor)) then
    select pr.full_name into v_signed_by
      from public.document_signatures ds
      join public.approval_rights ar on ar.document_type = ds.document_type and ar.approver_order = ds.slot and ar.user_id = p_actor
      join public.profiles pr on pr.id = ds.user_id
     where ds.document_type = p_document_type and ds.document_id = p_document_id
     order by ds.slot desc
     limit 1;
    if v_signed_by is not null then
      return jsonb_build_object('error', format('Already signed by %s for this step.', v_signed_by));
    end if;
  end if;

  if v_slot is null then
    return jsonb_build_object('error', 'This document is already fully signed.');
  end if;

  if v_slot = 1 then
    if p_actor <> v_creator then
      return jsonb_build_object('error', 'Only the document''s creator signs first.');
    end if;
  elsif not exists (
    select 1 from public.approval_rights
     where document_type = p_document_type and approver_order = v_slot and user_id = p_actor) then
    return jsonb_build_object('error', 'You are not the configured approver for this step.');
  end if;

  insert into public.document_signatures(document_type, document_id, slot, user_id, signature_image_data_url)
  values (p_document_type, p_document_id, v_slot, p_actor, v_img)
  on conflict (document_type, document_id, slot) do nothing;
  if not found then
    return jsonb_build_object('error', 'Someone else just signed this step. Refresh the page.');
  end if;
  v_signed_slots := v_signed_slots || v_slot;

  -- The same signature also fills any following slots this person is on.
  loop
    select min(s) into v_next_slot from unnest(v_required) as s where s <> all(v_signed_slots);
    exit when v_next_slot is null;
    exit when not exists (
      select 1 from public.approval_rights
       where document_type = p_document_type and approver_order = v_next_slot and user_id = p_actor);
    insert into public.document_signatures(document_type, document_id, slot, user_id, signature_image_data_url)
    values (p_document_type, p_document_id, v_next_slot, p_actor, v_img)
    on conflict (document_type, document_id, slot) do nothing;
    v_signed_slots := v_signed_slots || v_next_slot;
  end loop;

  select public.document_fully_signed(p_document_type, p_document_id) into v_fully;

  if v_fully and p_document_type = 'grn' then
    perform public.process_grn_line(gl.id)
      from public.grn_lines gl
     where gl.grn_id = p_document_id and gl.processed_at is null;
  end if;

  if not v_fully then
    select min(s) into v_next_slot from unnest(v_required) as s where s <> all(v_signed_slots);
    insert into public.notifications(type, message, link_path, created_by, recipient_id)
    select 'signature_required', format('Your signature is needed on a %s.', v_type_label), v_link, p_actor, ar.user_id
      from public.approval_rights ar
     where ar.document_type = p_document_type and ar.approver_order = v_next_slot;
  end if;

  return jsonb_build_object('ok', true, 'fully_signed', v_fully, 'slot', v_slot);
end;
$function$;

-- PO line price approval: anyone on PO slot 2 (Admin-only until someone is set).
create or replace function public.approve_po_line(p_line_id uuid, p_signature_id uuid, p_actor uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role public.role;
  v_img text;
  v_po_id uuid;
begin
  select role into v_role from public.profiles where id = p_actor;

  if exists (select 1 from public.approval_rights where document_type = 'po' and approver_order = 2) then
    if not exists (select 1 from public.approval_rights where document_type = 'po' and approver_order = 2 and user_id = p_actor) then
      return jsonb_build_object('error', 'You are not a configured PO approver.');
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
end; $function$;

create or replace function public.reject_po_line(p_line_id uuid, p_approver_id uuid, p_reason text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role public.role;
begin
  select role into v_role from public.profiles where id = p_approver_id;

  if exists (select 1 from public.approval_rights where document_type = 'po' and approver_order = 2) then
    if not exists (select 1 from public.approval_rights where document_type = 'po' and approver_order = 2 and user_id = p_approver_id) then
      return jsonb_build_object('error', 'You are not a configured PO approver.');
    end if;
  else
    if v_role is distinct from 'admin' then
      return jsonb_build_object('error', 'Only Admin can reject a PO line price (no PO approver configured yet).');
    end if;
  end if;

  perform set_config('yaha.po_line_approval_bypass', 'on', true);
  update public.po_lines
     set approval_status = 'rejected', approved_by = p_approver_id, approved_at = now(), rejection_reason = p_reason
   where id = p_line_id and approval_status = 'pending_approval';
  if not found then return jsonb_build_object('error', 'Line not pending approval'); end if;
  return jsonb_build_object('ok', true);
end; $function$;
