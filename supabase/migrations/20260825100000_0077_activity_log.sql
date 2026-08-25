-- Generic activity log: catches creates/edits/deletes on the tables listed
-- below regardless of how they happened (app server action, a test click,
-- or a direct SQL edit) — a plain server-action-level log would miss the
-- last case, which is exactly what was asked for. Combined with the
-- already-existing append-only ledgers (stock_movements, document_signatures)
-- and notifications into one unified, human-readable feed for admins/founders.

-- ---- audit_log: generic diff ledger, write-only via trigger ----
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  row_id      uuid,
  action      text not null check (action in ('insert','update','delete')),
  actor_id    uuid references public.profiles(id) on delete set null,
  old_data    jsonb,
  new_data    jsonb,
  occurred_at timestamptz not null default now()
);
create index idx_audit_log_occurred on public.audit_log(occurred_at desc);
create index idx_audit_log_table_row on public.audit_log(table_name, row_id);

alter table public.audit_log enable row level security;
create policy audit_log_sel on public.audit_log for select to authenticated using (public.auth_is_staff());
-- No insert/update/delete policy for authenticated — every write is via the
-- SECURITY DEFINER trigger function below, same "RPC/trigger is the only
-- path" pattern already used for document_signatures.

-- ---- log_audit_event: one generic trigger function, attached per table ----
create or replace function public.log_audit_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row_id uuid;
  v_actor uuid;
begin
  v_old := case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) else null end;
  v_new := case when TG_OP in ('INSERT','UPDATE') then to_jsonb(NEW) else null end;

  -- Skip pure re-saves (only updated_at changed, nothing real did).
  if TG_OP = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return NEW;
  end if;

  v_row_id := coalesce(v_new->>'id', v_old->>'id')::uuid;
  v_actor := coalesce(auth.uid(), (v_new->>'created_by')::uuid, (v_old->>'created_by')::uuid);

  insert into public.audit_log(table_name, row_id, action, actor_id, old_data, new_data)
  values (TG_TABLE_NAME, v_row_id, lower(TG_OP), v_actor, v_old, v_new);

  return coalesce(NEW, OLD);
end;
$$;

-- ---- attach to the included tables ----
create trigger trg_audit_purchase_orders   after insert or update or delete on public.purchase_orders   for each row execute function public.log_audit_event();
create trigger trg_audit_po_lines          after insert or update or delete on public.po_lines          for each row execute function public.log_audit_event();
create trigger trg_audit_grns              after insert or update or delete on public.grns              for each row execute function public.log_audit_event();
create trigger trg_audit_grn_lines         after insert or update or delete on public.grn_lines         for each row execute function public.log_audit_event();
create trigger trg_audit_job_work_orders   after insert or update or delete on public.job_work_orders   for each row execute function public.log_audit_event();
create trigger trg_audit_job_work_lines    after insert or update or delete on public.job_work_lines    for each row execute function public.log_audit_event();
create trigger trg_audit_requisitions      after insert or update or delete on public.requisitions      for each row execute function public.log_audit_event();
create trigger trg_audit_requisition_lines after insert or update or delete on public.requisition_lines for each row execute function public.log_audit_event();
create trigger trg_audit_projects          after insert or update or delete on public.projects          for each row execute function public.log_audit_event();
create trigger trg_audit_bom_lines         after insert or update or delete on public.bom_lines         for each row execute function public.log_audit_event();
create trigger trg_audit_profiles          after insert or update or delete on public.profiles          for each row execute function public.log_audit_event();
create trigger trg_audit_vendors           after insert or update or delete on public.vendors           for each row execute function public.log_audit_event();
create trigger trg_audit_customers         after insert or update or delete on public.customers         for each row execute function public.log_audit_event();
create trigger trg_audit_components        after insert or update or delete on public.components        for each row execute function public.log_audit_event();
create trigger trg_audit_approval_rights   after insert or update or delete on public.approval_rights   for each row execute function public.log_audit_event();

-- ---- notifications: widen read access to include founder, alongside the existing admin/team_lead ----
-- (needed so v_activity_log's notification branch, run under security_invoker,
-- doesn't silently drop rows for a founder viewing the log)
drop policy if exists notif_sel on public.notifications;
create policy notif_sel on public.notifications for select to authenticated
  using (public.auth_role() in ('admin','team_lead','founder'));

-- ---- v_activity_log: unified, human-data-ready feed across all 4 sources ----
create or replace view public.v_activity_log
with (security_invoker = true) as
select
  al.occurred_at,
  al.actor_id,
  'audit'::text as category,
  al.table_name as source_table,
  al.action,
  al.row_id,
  (case al.table_name
    when 'purchase_orders'   then coalesce(al.new_data->>'po_no', al.old_data->>'po_no')
    when 'grns'               then coalesce(al.new_data->>'grn_no', al.old_data->>'grn_no')
    when 'job_work_orders'    then coalesce(al.new_data->>'jw_no', al.old_data->>'jw_no')
    when 'requisitions'       then coalesce(al.new_data->>'req_no', al.old_data->>'req_no')
    when 'projects'           then coalesce(al.new_data->>'project_no', al.old_data->>'project_no')
    when 'profiles'           then coalesce(al.new_data->>'full_name', al.old_data->>'full_name')
    when 'vendors'            then coalesce(al.new_data->>'name', al.old_data->>'name')
    when 'customers'          then coalesce(al.new_data->>'name', al.old_data->>'name')
    when 'components'         then coalesce(al.new_data->>'component_no', al.old_data->>'component_no') || ' — ' || coalesce(al.new_data->>'name', al.old_data->>'name')
    when 'approval_rights'    then coalesce(al.new_data->>'document_type', al.old_data->>'document_type') || ' — slot ' || coalesce(al.new_data->>'approver_order', al.old_data->>'approver_order')
    when 'po_lines'           then (select po.po_no from public.purchase_orders po where po.id = coalesce((al.new_data->>'po_id')::uuid, (al.old_data->>'po_id')::uuid))
    when 'grn_lines'          then (select g.grn_no from public.grns g where g.id = coalesce((al.new_data->>'grn_id')::uuid, (al.old_data->>'grn_id')::uuid))
    when 'job_work_lines'     then (select jw.jw_no from public.job_work_orders jw where jw.id = coalesce((al.new_data->>'jw_order_id')::uuid, (al.old_data->>'jw_order_id')::uuid))
    when 'requisition_lines'  then (select r.req_no from public.requisitions r where r.id = coalesce((al.new_data->>'requisition_id')::uuid, (al.old_data->>'requisition_id')::uuid))
    when 'bom_lines'          then (select p.model_name from public.bom_templates bt join public.products p on p.id = bt.product_id where bt.id = coalesce((al.new_data->>'bom_id')::uuid, (al.old_data->>'bom_id')::uuid))
    else al.row_id::text
  end)::text as subject_label,
  jsonb_build_object('table_name', al.table_name, 'old_data', al.old_data, 'new_data', al.new_data) as detail,
  (case al.table_name
    when 'purchase_orders'    then '/purchase-orders/' || al.row_id::text
    when 'po_lines'           then '/purchase-orders/' || coalesce(al.new_data->>'po_id', al.old_data->>'po_id')
    when 'grns'               then '/grn/' || al.row_id::text
    when 'grn_lines'          then '/grn/' || coalesce(al.new_data->>'grn_id', al.old_data->>'grn_id')
    when 'job_work_orders'    then '/job-work/' || al.row_id::text
    when 'job_work_lines'     then '/job-work/' || coalesce(al.new_data->>'jw_order_id', al.old_data->>'jw_order_id')
    when 'requisitions'       then '/requisitions/' || al.row_id::text
    when 'requisition_lines'  then '/requisitions/' || coalesce(al.new_data->>'requisition_id', al.old_data->>'requisition_id')
    when 'projects'           then '/projects/' || al.row_id::text
    else null
  end)::text as link_path
from public.audit_log al

union all

select
  sm.performed_at as occurred_at,
  sm.performed_by as actor_id,
  'stock'::text as category,
  'stock_movements'::text as source_table,
  sm.movement_type::text as action,
  sm.id as row_id,
  (select c.component_no || ' — ' || c.name from public.components c where c.id = sm.component_id) as subject_label,
  jsonb_build_object('movement_type', sm.movement_type, 'qty', sm.qty, 'reference_type', sm.reference_type, 'reference_id', sm.reference_id, 'note', sm.note, 'lot_id', sm.lot_id, 'project_id', sm.project_id) as detail,
  ('/inventory/lots/' || sm.lot_id::text) as link_path
from public.stock_movements sm

union all

select
  ds.signed_at as occurred_at,
  ds.user_id as actor_id,
  'signature'::text as category,
  'document_signatures'::text as source_table,
  'signed'::text as action,
  ds.id as row_id,
  (case ds.document_type
    when 'po'       then (select po.po_no from public.purchase_orders po where po.id = ds.document_id)
    when 'grn'      then (select g.grn_no from public.grns g where g.id = ds.document_id)
    when 'job_work' then (select jw.jw_no from public.job_work_orders jw where jw.id = ds.document_id)
  end)::text as subject_label,
  jsonb_build_object('document_type', ds.document_type, 'document_id', ds.document_id, 'slot', ds.slot) as detail,
  (case ds.document_type
    when 'po'       then '/purchase-orders/' || ds.document_id::text
    when 'grn'      then '/grn/' || ds.document_id::text
    when 'job_work' then '/job-work/' || ds.document_id::text
  end)::text as link_path
from public.document_signatures ds

union all

select
  n.created_at as occurred_at,
  n.created_by as actor_id,
  'notification'::text as category,
  'notifications'::text as source_table,
  n.type as action,
  n.id as row_id,
  null::text as subject_label,
  jsonb_build_object('message', n.message, 'type', n.type) as detail,
  n.link_path
from public.notifications n;

grant select on public.v_activity_log to authenticated;
