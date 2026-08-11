-- ============================================================
-- 0047 — PO status lock-down + revisioning
--
-- New status value 'superseded' — used only on a PO row once it has been
-- cloned past (see clone_po_revision below). recompute_po_status() only
-- ever writes 'completed'/'partial' and returns early on 'cancelled', so
-- this new value is inert to that trigger.
--
-- root_po_id / revision_no / superseded_by track a PO's revision lineage:
-- the original PO has root_po_id = null, revision_no = 0; each clone
-- points root_po_id at the ORIGINAL row (never at its immediate parent,
-- so "all versions of this PO" is a flat query regardless of chain
-- length) and increments revision_no. superseded_by is null on whichever
-- row is currently live in a lineage.
--
-- NOTE: clone_po_revision's 'update' branch here has a bug fixed in
-- migration 0048 (it hardcoded project_id/expected_date to carry over
-- from the old line instead of reading them from p_patch). Kept here
-- verbatim as originally applied, for migration-history fidelity.
-- ============================================================

alter type public.po_status add value 'superseded';

alter table public.purchase_orders
  add column root_po_id    uuid references public.purchase_orders(id) on delete restrict,
  add column revision_no   int  not null default 0,
  add column superseded_by uuid references public.purchase_orders(id) on delete restrict;

create index idx_po_root on public.purchase_orders(root_po_id);

-- ---- pre-existing gap, now load-bearing: v_bom_variance's "ordered"
-- CTE never excluded cancelled po_lines. Harmless historically (a
-- manually-cancelled line was rare); becomes routine now that a
-- superseded PO's lines get cancelled below, so it must be excluded or
-- every revision cycle double-counts "ordered" qty against the BOM.
create or replace view public.v_bom_variance with (security_invoker = true) as
with req as (
  select b.project_id, bl.component_id, sum(bl.required_qty) as required_qty
  from public.boms b join public.bom_lines bl on bl.bom_id = b.id
  where bl.component_id is not null
  group by b.project_id, bl.component_id),
ord as (
  select pl.project_id, pl.component_id, sum(pl.qty_ordered) as ordered_qty
  from public.po_lines pl
  where pl.project_id is not null and pl.component_id is not null and pl.line_status <> 'cancelled'
  group by pl.project_id, pl.component_id),
rcv as (
  select gl.project_id, gl.component_id, sum(gl.qty_received) as received_qty
  from public.grn_lines gl
  where gl.project_id is not null and gl.component_id is not null
  group by gl.project_id, gl.component_id),
keys as (
  select project_id, component_id from req
  union select project_id, component_id from ord
  union select project_id, component_id from rcv)
select k.project_id, k.component_id,
       coalesce(req.required_qty, 0) as required_qty,
       coalesce(ord.ordered_qty, 0)  as ordered_qty,
       coalesce(rcv.received_qty, 0)  as received_qty,
       coalesce(req.required_qty,0) - coalesce(ord.ordered_qty,0) as order_gap,
       coalesce(ord.ordered_qty,0)  - coalesce(rcv.received_qty,0) as receive_gap
from keys k
left join req on req.project_id = k.project_id and req.component_id = k.component_id
left join ord on ord.project_id = k.project_id and ord.component_id = k.component_id
left join rcv on rcv.project_id = k.project_id and rcv.component_id = k.component_id;

-- ============================================================
-- clone_po_revision — the entire "edit a line on a sent PO" flow, as one
-- security-definer transaction. Deliberately NOT a sequence of separate
-- TS-level inserts: the yaha.po_line_approval_bypass session GUC (used to
-- carry forward each UNTOUCHED cloned line's approval_status verbatim,
-- so an unrelated edit can't silently re-run the price gate and
-- auto-approve/re-flag lines nobody touched) is transaction-local — it
-- only works if the whole clone is one transaction.
--
-- p_kind: 'add' | 'update' | 'remove' | 'header_vendor'
-- p_patch (jsonb): the new/changed line fields, or {"vendor_id":"..."}
--   for header_vendor. Amount is expected pre-computed by the caller
--   (mirrors addPoLine/updatePoLine's existing rate*qty fallback).
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
        v_line.project_id, v_line.requisition_line_id,
        coalesce((p_patch->>'qty_ordered')::numeric, v_line.qty_ordered),
        (p_patch->>'rate')::numeric,
        (p_patch->>'amount')::numeric,
        v_line.expected_date, p_actor
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
revoke all on function public.clone_po_revision(uuid, text, uuid, jsonb, uuid) from public, anon;
grant execute on function public.clone_po_revision(uuid, text, uuid, jsonb, uuid) to authenticated;

-- ---- RLS: split po_mod, add status/revision-aware delete gate ----
drop policy if exists po_mod on public.purchase_orders;
create policy po_ins on public.purchase_orders for insert to authenticated
  with check (public.auth_role() in ('admin','team_lead'));
create policy po_upd on public.purchase_orders for update to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
create policy po_del on public.purchase_orders for delete to authenticated
  using (
    (public.auth_role() = 'admin' or (public.auth_role() = 'team_lead' and status = 'draft'))
    and revision_no = 0 and superseded_by is null
    and not exists (select 1 from public.purchase_orders c where c.root_po_id = purchase_orders.id)
  );

-- ---- RLS: po_lines writes only allowed while the parent PO is still
-- draft/sent — defense in depth alongside the app-layer lock, so a
-- crafted request can't directly UPDATE a locked PO's lines. Doesn't
-- affect rollup_po_line()/po_line_price_gate()/clone_po_revision, all
-- security definer.
drop policy if exists poline_mod on public.po_lines;
create policy poline_mod on public.po_lines for all to authenticated
  using (
    public.auth_role() in ('admin','team_lead')
    and exists (select 1 from public.purchase_orders po where po.id = po_lines.po_id and po.status in ('draft','sent'))
  )
  with check (
    public.auth_role() in ('admin','team_lead')
    and exists (select 1 from public.purchase_orders po where po.id = po_lines.po_id and po.status in ('draft','sent'))
  );
