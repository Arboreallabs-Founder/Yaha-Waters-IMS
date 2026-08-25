-- Digital signatures + multi-approver sign-off for PO / GRN / Job-Work /
-- Inspection Template. See plan: signatures (per-user saved marks),
-- approval_rights (admin master: who fills approver slot 2/3 per doc
-- type), document_signatures (append-only signed record, image
-- snapshot). Slot 1 is always the document's creator; slots 2/3 are
-- optional, admin-configured. A document is "fully signed" once every
-- slot in {1} ∪ configured approval_rights slots has a row.

-- ---- signatures (per-user, self-service) ----
create table public.signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text,
  method text not null check (method in ('typed','drawn')),
  typed_text text,
  typed_font text,
  image_data_url text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index idx_signatures_user on public.signatures(user_id);

create or replace function public.signatures_single_default()
returns trigger language plpgsql as $$
begin
  if NEW.is_default then
    update public.signatures set is_default = false
     where user_id = NEW.user_id and id <> NEW.id and is_default;
  end if;
  return NEW;
end; $$;
create trigger trg_signatures_single_default
  before insert or update of is_default on public.signatures
  for each row when (NEW.is_default) execute function public.signatures_single_default();
create trigger trg_signatures_updated before update on public.signatures
  for each row execute function public.set_updated_at();

alter table public.signatures enable row level security;
create policy sig_sel on public.signatures for select to authenticated using (user_id = auth.uid());
create policy sig_ins on public.signatures for insert to authenticated with check (user_id = auth.uid());
create policy sig_upd on public.signatures for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sig_del on public.signatures for delete to authenticated using (user_id = auth.uid());

-- ---- approval_rights (admin master: approver slots 2/3 per doc type) ----
create table public.approval_rights (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('po','grn','job_work','inspection_template')),
  approver_order smallint not null check (approver_order in (2,3)),
  user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  unique (document_type, approver_order)
);

alter table public.approval_rights enable row level security;
create policy aright_sel on public.approval_rights for select to authenticated using (true);
create policy aright_mod on public.approval_rights for all to authenticated
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');

-- ---- document_signatures (append-only signed record) ----
create table public.document_signatures (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('po','grn','job_work','inspection_template')),
  document_id uuid not null,
  slot smallint not null check (slot in (1,2,3)),
  user_id uuid not null references public.profiles(id),
  signature_image_data_url text not null,
  signed_at timestamptz not null default now(),
  unique (document_type, document_id, slot)
);
create index idx_document_signatures_doc on public.document_signatures(document_type, document_id);

alter table public.document_signatures enable row level security;
create policy dsig_sel on public.document_signatures for select to authenticated using (true);
-- No insert/update/delete policy for authenticated/anon: every write goes
-- through the SECURITY DEFINER sign_* RPCs below, which bypass RLS.

-- ---- po_lines: signature snapshot for the (now-unified) price approval ----
alter table public.po_lines add column approval_signature_data_url text;

-- ---- job_work_orders: widen status check to include the interim state ----
alter table public.job_work_orders drop constraint job_work_orders_status_check;
alter table public.job_work_orders add constraint job_work_orders_status_check
  check (status = any (array['draft','sent','partial','received','cancelled','superseded','pending_signature']));

-- ---- inspection template edits invalidate any prior sign-off ----
create or replace function public.inspection_template_fields_clear_signatures()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_template_id uuid;
begin
  v_template_id := coalesce(NEW.template_id, OLD.template_id);
  delete from public.document_signatures
   where document_type = 'inspection_template' and document_id = v_template_id;
  return coalesce(NEW, OLD);
end; $$;
create trigger trg_inspection_fields_clear_signatures
  after insert or update or delete on public.inspection_template_fields
  for each row execute function public.inspection_template_fields_clear_signatures();

-- ---- document_fully_signed: shared completeness check ----
-- Required slots = {1} ∪ configured approval_rights slots for this doc
-- type. Used by the sign_* RPCs, dispatch_job_work's defense-in-depth
-- check, and directly by the GRN / Inspection Template print pages to
-- decide whether printing is allowed.
create or replace function public.document_fully_signed(p_document_type text, p_document_id uuid)
returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select array_agg(distinct slot order by slot) from public.document_signatures
       where document_type = p_document_type and document_id = p_document_id)
    =
    (select array(
       select distinct s from unnest(
         array[1::smallint] ||
         coalesce((select array_agg(approver_order) from public.approval_rights where document_type = p_document_type), array[]::smallint[])
       ) as s order by s
     )),
    false
  );
$$;
grant execute on function public.document_fully_signed(text, uuid) to authenticated;

-- ---- shared signing bookkeeping (not exposed to PostgREST directly) ----
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
  elsif p_document_type = 'inspection_template' then
    select created_by into v_creator from public.inspection_templates where id = p_document_id;
    v_link := '/masters/inspection-templates/' || p_document_id; v_type_label := 'inspection template';
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

-- ---- sign_po ----
create or replace function public.sign_po(p_po_id uuid, p_signature_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_res jsonb;
begin
  select public._record_signature('po', p_po_id, p_signature_id, p_actor) into v_res;
  if v_res ? 'error' then return v_res; end if;
  if (v_res->>'fully_signed')::boolean then
    update public.purchase_orders set status = 'sent' where id = p_po_id and status in ('draft','pending_signature');
  else
    update public.purchase_orders set status = 'pending_signature' where id = p_po_id and status = 'draft';
  end if;
  return v_res;
end; $$;
revoke all on function public.sign_po(uuid, uuid, uuid) from public, anon;
grant execute on function public.sign_po(uuid, uuid, uuid) to authenticated;

-- ---- sign_job_work (fully signed -> reuse existing dispatch_job_work) ----
create or replace function public.sign_job_work(p_jw_id uuid, p_signature_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_res jsonb; v_dispatch jsonb;
begin
  select public._record_signature('job_work', p_jw_id, p_signature_id, p_actor) into v_res;
  if v_res ? 'error' then return v_res; end if;
  if (v_res->>'fully_signed')::boolean then
    select public.dispatch_job_work(p_jw_id, p_actor) into v_dispatch;
    if v_dispatch ? 'error' then return v_dispatch; end if;
  else
    update public.job_work_orders set status = 'pending_signature' where id = p_jw_id and status = 'draft';
  end if;
  return v_res;
end; $$;
revoke all on function public.sign_job_work(uuid, uuid, uuid) from public, anon;
grant execute on function public.sign_job_work(uuid, uuid, uuid) to authenticated;

-- ---- sign_grn / sign_inspection_template (no status effect) ----
create or replace function public.sign_grn(p_grn_id uuid, p_signature_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  return public._record_signature('grn', p_grn_id, p_signature_id, p_actor);
end; $$;
revoke all on function public.sign_grn(uuid, uuid, uuid) from public, anon;
grant execute on function public.sign_grn(uuid, uuid, uuid) to authenticated;

create or replace function public.sign_inspection_template(p_template_id uuid, p_signature_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  return public._record_signature('inspection_template', p_template_id, p_signature_id, p_actor);
end; $$;
revoke all on function public.sign_inspection_template(uuid, uuid, uuid) from public, anon;
grant execute on function public.sign_inspection_template(uuid, uuid, uuid) to authenticated;

-- ---- dispatch_job_work: widen precondition + defense-in-depth signature check ----
create or replace function public.dispatch_job_work(p_order_id uuid, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_role  public.role;
  v_actor uuid := auth.uid();
  v_order record;
  v_line  record;
  v_lot   record;
  v_comp  record;
begin
  v_role := public.auth_role();
  if v_role is null or v_role not in ('admin','team_lead') then
    return jsonb_build_object('error','Not authorized to dispatch job work.');
  end if;

  select * into v_order from public.job_work_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('error','Order not found'); end if;
  if v_order.status not in ('draft','pending_signature') then
    return jsonb_build_object('error','Only draft orders can be dispatched');
  end if;
  if not public.document_fully_signed('job_work', p_order_id) then
    return jsonb_build_object('error','This order is not fully signed yet.');
  end if;

  for v_line in select * from public.job_work_lines where jw_order_id = p_order_id loop
    if v_line.raw_lot_id is null then
      raise exception 'JOB_WORK: a line has no raw lot selected';
    end if;
    select * into v_lot from public.inventory_lots where id = v_line.raw_lot_id for update;
    if coalesce(v_lot.qty_on_hand,0) < v_line.qty_sent then
      raise exception 'JOB_WORK: raw lot % has only % (need %)', v_lot.lot_code, v_lot.qty_on_hand, v_line.qty_sent;
    end if;
    select * into v_comp from public.components where id = v_line.component_id;
    if coalesce(v_line.jw_rate, v_comp.jw_rate) is null then
      raise exception 'JOB_WORK: % has no job-work rate set — add a rate on the line or in Masters', coalesce(v_comp.component_no, 'component');
    end if;
    insert into public.stock_movements(
      lot_id, component_id, movement_type, qty, project_id,
      reference_type, reference_id, performed_by, created_by)
    values (v_line.raw_lot_id, v_line.component_id, 'issue', -v_line.qty_sent, v_order.project_id,
      'job_work', p_order_id, v_actor, v_actor);
  end loop;

  update public.job_work_orders set status='sent', sent_date=current_date where id = p_order_id;
  return jsonb_build_object('ok', true);
end; $function$;

-- ---- approve_po_line / reject_po_line: route through the configured PO approver + require a signature to approve ----
drop function if exists public.approve_po_line(uuid, uuid);

create or replace function public.approve_po_line(p_line_id uuid, p_signature_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_role public.role;
  v_configured uuid;
  v_img text;
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

  perform set_config('yaha.po_line_approval_bypass', 'on', true);
  update public.po_lines
     set approval_status = 'approved', approved_by = p_actor, approved_at = now(),
         rejection_reason = null, approval_signature_data_url = v_img
   where id = p_line_id and approval_status = 'pending_approval';
  if not found then return jsonb_build_object('error', 'Line not pending approval'); end if;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.approve_po_line(uuid, uuid, uuid) from public, anon;
grant execute on function public.approve_po_line(uuid, uuid, uuid) to authenticated;

create or replace function public.reject_po_line(p_line_id uuid, p_approver_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role public.role;
  v_configured uuid;
begin
  select role into v_role from public.profiles where id = p_approver_id;
  select user_id into v_configured from public.approval_rights where document_type = 'po' and approver_order = 2;

  if v_configured is not null then
    if p_approver_id <> v_configured then
      return jsonb_build_object('error', 'You are not the configured PO approver.');
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
end; $$;
