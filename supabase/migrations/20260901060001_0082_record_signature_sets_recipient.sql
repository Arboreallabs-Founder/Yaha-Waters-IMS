-- ============================================================
-- 0082 — _record_signature: persist the resolved next-signer as the
-- notification's recipient_id (was computed and then discarded before).
-- Identical to 0076's body except for that one field on the insert.
-- ============================================================
create or replace function public._record_signature(
  p_document_type text, p_document_id uuid, p_signature_id uuid, p_actor uuid
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_img text;
  v_creator uuid;
  v_link text;
  v_type_label text;
  v_signed_slots smallint[];
  v_required smallint[];
  v_slot smallint;
  v_approver uuid;
  v_fully boolean;
  v_next_slot smallint;
  v_next_user uuid;
begin
  select image_data_url into v_img from public.signatures where id = p_signature_id and user_id = p_actor;
  if not found then
    return jsonb_build_object('error', 'Signature not found.');
  end if;

  if p_document_type = 'po' then
    select created_by into v_creator from public.purchase_orders where id = p_document_id;
    v_link := '/purchase-orders/' || p_document_id; v_type_label := 'purchase order';
  elsif p_document_type = 'grn' then
    select created_by into v_creator from public.grns where id = p_document_id;
    v_link := '/grn/' || p_document_id; v_type_label := 'GRN';
  elsif p_document_type = 'job_work' then
    select created_by into v_creator from public.job_work_orders where id = p_document_id;
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
  if v_slot is null then
    return jsonb_build_object('error', 'This document is already fully signed.');
  end if;

  if v_slot = 1 then
    if p_actor <> v_creator then
      return jsonb_build_object('error', 'Only the document''s creator signs first.');
    end if;
  else
    select user_id into v_approver from public.approval_rights
      where document_type = p_document_type and approver_order = v_slot;
    if v_approver is null or p_actor <> v_approver then
      return jsonb_build_object('error', 'You are not the configured approver for this step.');
    end if;
  end if;

  insert into public.document_signatures(document_type, document_id, slot, user_id, signature_image_data_url)
  values (p_document_type, p_document_id, v_slot, p_actor, v_img);
  v_signed_slots := v_signed_slots || v_slot;

  -- Cascade: keep signing forward through consecutive slots still configured
  -- to this same actor (e.g. same person as 2nd and 3rd signer, or creator
  -- who's also the configured approver).
  loop
    select min(s) into v_next_slot from unnest(v_required) as s where s <> all(v_signed_slots);
    exit when v_next_slot is null;
    select user_id into v_next_user from public.approval_rights
      where document_type = p_document_type and approver_order = v_next_slot;
    exit when v_next_user is distinct from p_actor;
    insert into public.document_signatures(document_type, document_id, slot, user_id, signature_image_data_url)
    values (p_document_type, p_document_id, v_next_slot, p_actor, v_img);
    v_signed_slots := v_signed_slots || v_next_slot;
  end loop;

  select public.document_fully_signed(p_document_type, p_document_id) into v_fully;

  if not v_fully then
    select min(s) into v_next_slot from unnest(v_required) as s where s <> all(v_signed_slots);
    select user_id into v_next_user from public.approval_rights
      where document_type = p_document_type and approver_order = v_next_slot;
    if v_next_user is not null then
      insert into public.notifications(type, message, link_path, created_by, recipient_id)
      values ('signature_required', format('Your signature is needed on a %s.', v_type_label), v_link, p_actor, v_next_user);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'fully_signed', v_fully, 'slot', v_slot);
end;
$$;
revoke all on function public._record_signature(text, uuid, uuid, uuid) from public, anon, authenticated;
