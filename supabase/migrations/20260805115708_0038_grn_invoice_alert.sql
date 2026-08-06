-- ============================================================
-- 0038 — GRN: require challan or invoice number (at least one), and
-- alert admin/team_lead when a GRN is receipted with a challan but no
-- invoice number, so it doesn't slip through accounting/matching.
-- ============================================================

create or replace function public.notify_grn_missing_invoice(p_grn_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_grn_no text;
  v_name   text;
begin
  select grn_no into v_grn_no from public.grns where id = p_grn_id;
  select full_name into v_name from public.profiles where id = p_user_id;
  insert into public.notifications(type, message, link_path, created_by)
  values ('grn_missing_invoice',
    format('%s received %s without an invoice number (challan only).', coalesce(v_name, 'Someone'), coalesce(v_grn_no, 'a GRN')),
    '/grn/' || p_grn_id, p_user_id);
end; $$;
grant execute on function public.notify_grn_missing_invoice(uuid,uuid) to authenticated;
