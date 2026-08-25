-- Inspection Templates are a standalone, reusable QC checklist master (and,
-- as of the MRIN-style print, just a blank preview of a GRN) — they never
-- represented a real transaction needing sign-off. Removing them from the
-- whole digital-signature system entirely.

delete from public.document_signatures where document_type = 'inspection_template';
delete from public.approval_rights where document_type = 'inspection_template';

drop trigger if exists trg_inspection_fields_clear_signatures on public.inspection_template_fields;
drop function if exists public.inspection_template_fields_clear_signatures();
drop function if exists public.sign_inspection_template(uuid, uuid, uuid);

alter table public.approval_rights drop constraint approval_rights_document_type_check;
alter table public.approval_rights add constraint approval_rights_document_type_check
  check (document_type in ('po','grn','job_work'));

alter table public.document_signatures drop constraint document_signatures_document_type_check;
alter table public.document_signatures add constraint document_signatures_document_type_check
  check (document_type in ('po','grn','job_work'));

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

  select public.document_fully_signed(p_document_type, p_document_id) into v_fully;

  if not v_fully then
    select min(s) into v_next_slot from unnest(v_required) as s where s <> all(v_signed_slots || v_slot);
    select user_id into v_next_user from public.approval_rights
      where document_type = p_document_type and approver_order = v_next_slot;
    if v_next_user is not null then
      insert into public.notifications(type, message, link_path, created_by)
      values ('signature_required', format('Your signature is needed on a %s.', v_type_label), v_link, p_actor);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'fully_signed', v_fully, 'slot', v_slot);
end;
$$;
revoke all on function public._record_signature(text, uuid, uuid, uuid) from public, anon, authenticated;
