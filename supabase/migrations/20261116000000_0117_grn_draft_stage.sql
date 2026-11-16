-- GRN draft stage, like POs.
--
-- A new GRN starts as a 'draft'. Nobody else sees it as waiting: no signature
-- is added, Prem isn't notified, nothing on it can be approved and it can't be
-- printed. Its creator adds the components, then presses Sign & Send
-- (send_grn), which marks it 'sent' and records their signature — that's
-- what notifies the approver. A GRN with nothing on it can't be sent.
--
-- While it's a draft, its creator or an Admin can change the challan /
-- invoice number, remove a wrongly added item, or delete the whole draft.
-- After it's sent, everything works exactly as before.
--
-- Existing GRNs are all 'sent', except the empty ones still waiting on their
-- approver, which go back to draft (their creator's automatic signature and
-- the "signature needed" notice are removed) so they can be finished or
-- deleted.

-- ---------- status ----------
alter table public.grns add column if not exists status text not null default 'sent';
alter table public.grns drop constraint if exists grns_status_check;
alter table public.grns add constraint grns_status_check check (status in ('draft', 'sent'));
alter table public.grns alter column status set default 'draft';

-- A GRN is created as a draft and only Sign & Send makes it 'sent'. Direct
-- edits of the status (the API allows Admin / Team Lead to update grns) are
-- refused; migrations (no signed-in user) are not affected.
create or replace function public.guard_grn_status()
 returns trigger language plpgsql set search_path to 'public'
as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'draft';
  elsif new.status is distinct from old.status
        and coalesce(current_setting('yaha.grn_send', true), '') <> 'on' then
    raise exception 'A GRN is sent with Sign & Send, not by editing it.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
drop trigger if exists trg_grns_guard_status on public.grns;
create trigger trg_grns_guard_status before insert or update on public.grns
  for each row execute function public.guard_grn_status();

-- ---------- signing refuses drafts ----------
-- Same as 0113, plus: a draft GRN can't be signed. send_grn marks it sent
-- first, then records the creator's signature through here.
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
  v_grn_status text;
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
    select created_by, status into v_creator, v_grn_status from public.grns where id = p_document_id for update;
    v_link := '/grn/' || p_document_id; v_type_label := 'GRN';
    if v_grn_status = 'draft' then
      return jsonb_build_object('error', 'This GRN is still a draft — its creator sends it with Sign & Send.');
    end if;
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

-- ---------- inspections on a draft wait ----------
-- Same as before, plus: nothing on a draft GRN is approved — not even by an
-- Admin who raised it (submit_irn's inline auto-approve then just leaves the
-- inspection pending). It's approved after Sign & Send, by the approver's
-- signature or here.
create or replace function public.approve_irn(p_irn_id uuid, p_approver_id uuid, p_signature_id uuid, p_remarks text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  if (select status from public.grns where id = v_irn.grn_id) = 'draft' then
    return jsonb_build_object('error','This GRN is still a draft — inspections are approved after it is sent.');
  end if;

  insert into public.grn_lines(grn_id, component_id, qty_received, po_line_id, project_id, unit_cost, target_lot_id, jw_line_id,
        piece_count, piece_length, piece_width, piece_weight, created_by)
  values (v_irn.grn_id, v_irn.component_id, v_irn.qty, v_irn.po_line_id, v_irn.project_id, v_irn.unit_cost, v_irn.target_lot_id, v_irn.jw_line_id,
        v_irn.piece_count, v_irn.piece_length, v_irn.piece_width, v_irn.piece_weight, v_irn.generated_by)
  returning id into v_line_id;

  update public.irns
     set status = 'approved', approved_by = auth.uid(), approved_at = now(), grn_line_id = v_line_id,
         approval_remarks = nullif(trim(p_remarks), '')
   where id = p_irn_id;

  perform public._record_signature('grn', v_irn.grn_id, p_signature_id, auth.uid());

  return jsonb_build_object('ok', true, 'grn_line_id', v_line_id);
end;
$function$;

-- ---------- Sign & Send ----------
create or replace function public.send_grn(p_grn_id uuid, p_signature_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_role  public.role := public.auth_role();
  v_grn   record;
  v_res   jsonb;
  v_irn   record;
  v_appr  jsonb;
  v_n     int := 0;
begin
  if v_actor is null then return jsonb_build_object('error', 'Not signed in.'); end if;

  select * into v_grn from public.grns where id = p_grn_id for update;
  if not found then return jsonb_build_object('error', 'GRN not found.'); end if;
  if v_grn.status <> 'draft' then return jsonb_build_object('error', 'This GRN has already been sent.'); end if;
  if v_grn.created_by is distinct from v_actor then
    return jsonb_build_object('error', 'Only the person who started this GRN can send it.');
  end if;
  if not exists (select 1 from public.grn_lines where grn_id = p_grn_id)
     and not exists (select 1 from public.irns where grn_id = p_grn_id and status = 'pending_approval') then
    return jsonb_build_object('error', 'Add at least one component before sending this GRN.');
  end if;

  perform set_config('yaha.grn_send', 'on', true);
  update public.grns set status = 'sent' where id = p_grn_id;
  perform set_config('yaha.grn_send', 'off', true);

  v_res := public._record_signature('grn', p_grn_id, p_signature_id, v_actor);
  if v_res ? 'error' then
    -- Undo the status change too.
    raise exception '%', v_res->>'error';
  end if;

  -- If the sender is also the GRN's approver (their signature filled an
  -- approver step), that signature approves the pending inspections — the
  -- same as signing as approver does (sign_grn).
  if v_role in ('admin', 'team_lead') and exists (
       select 1 from public.document_signatures
        where document_type = 'grn' and document_id = p_grn_id and slot > 1 and user_id = v_actor) then
    for v_irn in
      select id, irn_no from public.irns
       where grn_id = p_grn_id and status = 'pending_approval'
       order by created_at
       for update
    loop
      v_appr := public.approve_irn(v_irn.id, v_actor, p_signature_id, 'Approved by signing the GRN');
      if v_appr ? 'error' then
        raise exception 'Could not approve inspection %: %', v_irn.irn_no, v_appr->>'error';
      end if;
      v_n := v_n + 1;
    end loop;
  end if;

  if nullif(trim(coalesce(v_grn.invoice_no, '')), '') is null then
    perform public.notify_grn_missing_invoice(p_grn_id, v_actor);
  end if;

  return v_res || jsonb_build_object('irns_approved', v_n);
end;
$function$;

-- ---------- draft-only edits: creator or Admin ----------
create or replace function public._draft_grn_for_edit(p_grn_id uuid)
 returns public.grns
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_grn public.grns;
begin
  select * into v_grn from public.grns where id = p_grn_id for update;
  if not found then raise exception 'GRN not found.'; end if;
  if v_grn.status <> 'draft' then
    raise exception 'This GRN has already been sent — it can''t be changed here.';
  end if;
  if not (v_grn.created_by = auth.uid() or public.auth_role() = 'admin') then
    raise exception 'Only the person who started this GRN, or an Admin, can change it while it''s a draft.'
      using errcode = 'insufficient_privilege';
  end if;
  return v_grn;
end;
$function$;

create or replace function public.update_draft_grn(p_grn_id uuid, p_challan_no text, p_invoice_no text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_challan text := nullif(trim(coalesce(p_challan_no, '')), ''); v_invoice text := nullif(trim(coalesce(p_invoice_no, '')), '');
begin
  perform public._draft_grn_for_edit(p_grn_id);
  if v_challan is null and v_invoice is null then
    return jsonb_build_object('error', 'Enter a challan number or an invoice number — at least one is required.');
  end if;
  update public.grns set challan_no = v_challan, invoice_no = v_invoice where id = p_grn_id;
  return jsonb_build_object('ok', true);
end;
$function$;

-- Remove one item from a draft: a received line, or an inspection report
-- that hasn't been approved (on a draft none can be).
create or replace function public.remove_draft_grn_item(p_grn_id uuid, p_line_id uuid default null, p_irn_id uuid default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public._draft_grn_for_edit(p_grn_id);
  if p_line_id is not null then
    if exists (select 1 from public.grn_lines where id = p_line_id and grn_id = p_grn_id and processed_at is not null) then
      return jsonb_build_object('error', 'That line is already in stock — it can''t be removed.');
    end if;
    update public.irns set grn_line_id = null where grn_line_id = p_line_id and grn_id = p_grn_id;
    delete from public.grn_lines where id = p_line_id and grn_id = p_grn_id and processed_at is null;
    if not found then return jsonb_build_object('error', 'Line not found on this GRN.'); end if;
  elsif p_irn_id is not null then
    update public.irns set supersedes_irn_id = null where supersedes_irn_id = p_irn_id;
    delete from public.irns where id = p_irn_id and grn_id = p_grn_id and status <> 'approved';
    if not found then return jsonb_build_object('error', 'Inspection report not found on this GRN.'); end if;
  else
    return jsonb_build_object('error', 'Nothing to remove.');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- Delete a whole draft, with everything on it. Sent GRNs keep the old rule
-- (Admin only, through the normal delete).
create or replace function public.delete_draft_grn(p_grn_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_grn public.grns;
begin
  v_grn := public._draft_grn_for_edit(p_grn_id);
  if exists (select 1 from public.grn_lines where grn_id = p_grn_id and processed_at is not null) then
    return jsonb_build_object('error', 'Part of this GRN is already in stock — it can''t be deleted.');
  end if;
  update public.irns set supersedes_irn_id = null
   where supersedes_irn_id in (select id from public.irns where grn_id = p_grn_id);
  delete from public.irns where grn_id = p_grn_id;
  delete from public.grn_lines where grn_id = p_grn_id;
  delete from public.document_signatures where document_type = 'grn' and document_id = p_grn_id;
  delete from public.notifications where link_path = '/grn/' || p_grn_id;
  delete from public.grns where id = p_grn_id;
  return jsonb_build_object('ok', true, 'grn_no', v_grn.grn_no);
end;
$function$;

revoke all on function public._draft_grn_for_edit(uuid) from public, anon, authenticated;
revoke all on function public.send_grn(uuid, uuid) from public, anon;
revoke all on function public.update_draft_grn(uuid, text, text) from public, anon;
revoke all on function public.remove_draft_grn_item(uuid, uuid, uuid) from public, anon;
revoke all on function public.delete_draft_grn(uuid) from public, anon;
grant execute on function public.send_grn(uuid, uuid) to authenticated;
grant execute on function public.update_draft_grn(uuid, text, text) to authenticated;
grant execute on function public.remove_draft_grn_item(uuid, uuid, uuid) to authenticated;
grant execute on function public.delete_draft_grn(uuid) to authenticated;

-- ---------- existing empty GRNs back to draft ----------
-- The empty ones still waiting on their approver (only the creator's
-- automatic signature, or none). Re-checked here so anything that changed
-- since the list was made is left alone.
with targets as (
  select g.id
    from public.grns g
   where g.grn_no in ('GRN/26-27/0263', 'GRN/26-27/0309', 'GRN/26-27/0317', 'GRN/26-27/0319',
                      'GRN/26-27/0321', 'GRN/26-27/0327', 'GRN/26-27/0329', 'GRN/26-27/0331',
                      'GRN/26-27/0332', 'GRN/26-27/0336', 'GRN/26-27/0344', 'GRN/26-27/0346',
                      'GRN/26-27/0347', 'GRN/26-27/0352', 'GRN/26-27/0358', 'GRN/26-27/0361')
     and not exists (select 1 from public.grn_lines l where l.grn_id = g.id)
     and not exists (select 1 from public.irns i where i.grn_id = g.id)
     and not exists (select 1 from public.document_signatures s
                      where s.document_type = 'grn' and s.document_id = g.id and s.slot > 1)
), sigs as (
  delete from public.document_signatures
   where document_type = 'grn' and document_id in (select id from targets)
), notes as (
  delete from public.notifications
   where type in ('signature_required', 'grn_missing_invoice')
     and link_path in (select '/grn/' || id from targets)
)
update public.grns set status = 'draft' where id in (select id from targets);

-- ---------- the plain Sign action on a draft = Sign & Send ----------
-- Same as 0104, plus: signing a draft (only its creator can) sends it, with
-- the same not-empty check. Keeps older screens working, and means there's
-- one rule however the signature arrives.
create or replace function public.sign_grn(p_grn_id uuid, p_signature_id uuid, p_actor uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_res     jsonb;
  v_role    public.role;
  v_irn     record;
  v_appr    jsonb;
  v_n       int := 0;
begin
  if (select status from public.grns where id = p_grn_id) = 'draft' then
    if p_actor is distinct from auth.uid() then
      return jsonb_build_object('error', 'Only the person who started this GRN can send it.');
    end if;
    return public.send_grn(p_grn_id, p_signature_id);
  end if;

  v_res := public._record_signature('grn', p_grn_id, p_signature_id, p_actor);
  if v_res ? 'error' then return v_res; end if;

  select role into v_role from public.profiles where id = p_actor;
  if v_role in ('admin', 'team_lead') then
    for v_irn in
      select id, irn_no from public.irns
       where grn_id = p_grn_id and status = 'pending_approval'
       order by created_at
       for update
    loop
      v_appr := public.approve_irn(v_irn.id, p_actor, p_signature_id, 'Approved by signing the GRN');
      if v_appr ? 'error' then
        raise exception 'Could not approve inspection %: %', v_irn.irn_no, v_appr->>'error';
      end if;
      v_n := v_n + 1;
    end loop;
  end if;

  return v_res || jsonb_build_object('irns_approved', v_n);
end; $function$;
