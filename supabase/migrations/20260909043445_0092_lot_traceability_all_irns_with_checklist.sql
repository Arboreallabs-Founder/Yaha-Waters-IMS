-- ============================================================
-- 0092 — get_lot_traceability(): return EVERY IRN tied to the lot's
-- originating GRN line (not just one, arbitrarily picked when a lot
-- has a rejected + resubmitted IRN pair), each with its FULL checklist
-- of answers — every active field on that IRN's own template,
-- regardless of show_on_printout, since traceability should show
-- everything captured, not just what prints on the physical MRIN.
--
-- 'irn' changes from a single object to a jsonb array, oldest first.
-- Only call site is src/app/(app)/traceability/actions.ts (updated in
-- the same change) — no other consumer of this RPC.
-- ============================================================

create or replace function public.get_lot_traceability(p_lot_code text)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_lot record;
  v_lineage_ids uuid[];
  v_root_lot_id uuid;
  v_lineage jsonb;
  v_po jsonb;
  v_grn jsonb;
  v_jw jsonb;
  v_irn jsonb;
  v_movements jsonb;
begin
  select * into v_lot from public.inventory_lots where lot_code = p_lot_code;
  if not found then return jsonb_build_object('error', 'Lot not found'); end if;

  with recursive lineage as (
    select l.id, l.parent_lot_id, 0 as depth from public.inventory_lots l where l.id = v_lot.id
    union all
    select p.id, p.parent_lot_id, lineage.depth + 1
    from public.inventory_lots p join lineage on lineage.parent_lot_id = p.id
  )
  select array_agg(id) into v_lineage_ids from lineage;

  select id into v_root_lot_id
  from public.inventory_lots where id = any(v_lineage_ids) and parent_lot_id is null
  order by created_at asc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'lot_id', l.id, 'lot_code', l.lot_code, 'jw_stage', l.jw_stage, 'created_at', l.created_at
    ) order by l.created_at asc), '[]')
    into v_lineage
  from public.inventory_lots l where l.id = any(v_lineage_ids);

  select coalesce(jsonb_agg(jsonb_build_object(
      'jw_no', jwo.jw_no, 'vendor_name', v.name, 'sent_date', jwo.sent_date, 'expected_date', jwo.expected_date,
      'status', jwo.status, 'qty_sent', jwl.qty_sent, 'qty_returned', jwl.qty_returned,
      'raw_lot_code', rawlot.lot_code, 'completed_lot_code', complot.lot_code
    )), '[]')
    into v_jw
  from public.job_work_lines jwl
  join public.job_work_orders jwo on jwo.id = jwl.jw_order_id
  left join public.vendors v on v.id = jwo.vendor_id
  left join public.inventory_lots rawlot on rawlot.id = jwl.raw_lot_id
  left join public.inventory_lots complot on complot.id = jwl.completed_lot_id
  where jwl.raw_lot_id = any(v_lineage_ids) or jwl.completed_lot_id = any(v_lineage_ids);

  select jsonb_build_object(
      'po_no', po.po_no, 'po_date', po.po_date, 'raised_by', praiser.full_name,
      'vendor_name', pv.name, 'qty_ordered', pol.qty_ordered, 'rate', pol.rate
    ) into v_po
  from public.inventory_lots il
  join public.grn_lines gl on gl.id = il.grn_line_id
  left join public.po_lines pol on pol.id = gl.po_line_id
  left join public.purchase_orders po on po.id = pol.po_id
  left join public.profiles praiser on praiser.id = po.created_by
  left join public.vendors pv on pv.id = po.vendor_id
  where il.id = v_root_lot_id;

  select jsonb_build_object(
      'grn_no', g.grn_no, 'challan_no', g.challan_no, 'invoice_no', g.invoice_no,
      'received_by', recv.full_name, 'received_at', g.received_at, 'is_untagged', gl.is_untagged
    ) into v_grn
  from public.inventory_lots il
  join public.grn_lines gl on gl.id = il.grn_line_id
  join public.grns g on g.id = gl.grn_id
  left join public.profiles recv on recv.id = g.received_by
  where il.id = v_root_lot_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'irn_no', i.irn_no, 'status', i.status, 'template_name', t.name,
      'generated_by', gen.full_name, 'generated_at', i.generated_at,
      'approved_by', app.full_name, 'approved_at', i.approved_at,
      'rejection_reason', i.rejection_reason,
      'approval_remarks', i.approval_remarks,
      'checklist', coalesce(ans.checklist, '[]'::jsonb)
    ) order by i.generated_at asc), '[]')
    into v_irn
  from public.inventory_lots il
  join public.grn_lines gl on gl.id = il.grn_line_id
  join public.irns i on i.grn_line_id = gl.id
  left join public.inspection_templates t on t.id = i.template_id
  left join public.profiles gen on gen.id = i.generated_by
  left join public.profiles app on app.id = i.approved_by
  left join lateral (
    select jsonb_agg(jsonb_build_object(
        'label', f.label,
        'field_type', f.field_type,
        'value', case
          when f.field_type = 'checkbox' then
            (case a.choice_value when 'true' then 'Yes' when 'false' then 'No' else null end)
          when f.field_type = 'number' then a.number_value::text
          else coalesce(a.text_value, a.choice_value)
        end
      ) order by f.sort_order) as checklist
    from public.inspection_template_fields f
    left join public.irn_answers a on a.irn_id = i.id and a.field_id = f.id
    where f.template_id = i.template_id and f.is_active = true
  ) ans on true
  where il.id = v_root_lot_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'movement_type', sm.movement_type, 'qty', sm.qty, 'project_no', pr.project_no,
      'reference_type', sm.reference_type, 'reference_id', sm.reference_id,
      'performed_by', perf.full_name, 'performed_at', sm.performed_at, 'note', sm.note
    ) order by sm.performed_at desc), '[]')
    into v_movements
  from public.stock_movements sm
  left join public.projects pr on pr.id = sm.project_id
  left join public.profiles perf on perf.id = sm.performed_by
  where sm.lot_id = v_lot.id;

  return jsonb_build_object(
    'lot', jsonb_build_object('id', v_lot.id, 'lot_code', v_lot.lot_code, 'component_id', v_lot.component_id,
      'status', v_lot.status, 'qty_on_hand', v_lot.qty_on_hand, 'qty_initial', v_lot.qty_initial,
      'unit_cost', v_lot.unit_cost, 'jw_stage', v_lot.jw_stage, 'created_at', v_lot.created_at),
    'lineage', v_lineage,
    'purchase_order', v_po,
    'grn', v_grn,
    'job_work', v_jw,
    'irn', v_irn,
    'movements', v_movements
  );
end; $function$;
