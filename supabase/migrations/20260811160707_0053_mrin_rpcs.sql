-- ============================================================
-- 0053 — MRIN module: save RPC.
-- Single atomic call spanning all 4 tables (header + both fixed
-- checklists + lines) so the fillable form never leaves a half-saved
-- state on partial failure — mirrors submit_irn's multi-table-in-one-
-- transaction shape in 0037_irn_rpcs.sql.
-- ============================================================

create or replace function public.save_mrin(
  p_mrin_id uuid,
  p_actor_id uuid,
  p_header jsonb,   -- {vehicle_no, project_customer, disposition, remarks,
                     --  prepared_by_name, inspected_by_name, approved_by_name}
  p_checks jsonb,   -- [{id, result, status, remarks}]
  p_docs   jsonb,   -- [{id, ok, remarks}]
  p_lines  jsonb    -- [{id, accepted_qty, rejected_qty, heat_no, tc_no, remarks}]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_role public.role; v_row jsonb;
begin
  select role into v_role from public.profiles where id = p_actor_id;
  if v_role is null or v_role not in ('admin','team_lead','team_member') then
    return jsonb_build_object('error','Not authorized to save the MRIN.');
  end if;
  if not exists (select 1 from public.mrins where id = p_mrin_id) then
    return jsonb_build_object('error','MRIN not found.');
  end if;

  update public.mrins set
    vehicle_no = nullif(trim(p_header->>'vehicle_no'), ''),
    project_customer = nullif(trim(p_header->>'project_customer'), ''),
    disposition = case when coalesce(p_header->>'disposition','') <> '' then (p_header->>'disposition')::public.mrin_disposition else null end,
    remarks = nullif(trim(p_header->>'remarks'), ''),
    prepared_by_name = nullif(trim(p_header->>'prepared_by_name'), ''),
    inspected_by_name = nullif(trim(p_header->>'inspected_by_name'), ''),
    approved_by_name = nullif(trim(p_header->>'approved_by_name'), '')
  where id = p_mrin_id;

  for v_row in select * from jsonb_array_elements(coalesce(p_checks,'[]'::jsonb)) loop
    update public.mrin_inspection_checks set
      result = nullif(trim(v_row->>'result'), ''),
      status = nullif(trim(v_row->>'status'), ''),
      remarks = nullif(trim(v_row->>'remarks'), ''),
      updated_at = now()
    where id = (v_row->>'id')::uuid and mrin_id = p_mrin_id;
  end loop;

  for v_row in select * from jsonb_array_elements(coalesce(p_docs,'[]'::jsonb)) loop
    update public.mrin_document_checks set
      ok = case when coalesce(v_row->>'ok','') <> '' then (v_row->>'ok')::boolean else null end,
      remarks = nullif(trim(v_row->>'remarks'), ''),
      updated_at = now()
    where id = (v_row->>'id')::uuid and mrin_id = p_mrin_id;
  end loop;

  for v_row in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    update public.mrin_lines set
      accepted_qty = coalesce((v_row->>'accepted_qty')::numeric, 0),
      rejected_qty = coalesce((v_row->>'rejected_qty')::numeric, 0),
      heat_no = nullif(trim(v_row->>'heat_no'), ''),
      tc_no = nullif(trim(v_row->>'tc_no'), ''),
      remarks = nullif(trim(v_row->>'remarks'), ''),
      updated_at = now()
    where id = (v_row->>'id')::uuid and mrin_id = p_mrin_id;
  end loop;

  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.save_mrin(uuid, uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
