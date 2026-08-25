-- Historical documents (created before the digital-signature feature existed,
-- or already sent/dispatched before their creator ever got a chance to sign)
-- have no way to pick up the creator's signature after the fact. This adds a
-- record-only signing path — it calls the same _record_signature bookkeeping
-- as the live sign_* RPCs, but never triggers a status transition or
-- dispatch_job_work, since those documents have already moved on for real.
create or replace function public.backfill_signature(
  p_document_type text, p_document_id uuid, p_signature_id uuid, p_actor uuid
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_status text;
begin
  if p_document_type = 'po' then
    select status into v_status from public.purchase_orders where id = p_document_id;
    if v_status in ('draft', 'pending_signature') then
      return jsonb_build_object('error', 'This PO is still in progress — use the normal Sign action instead.');
    end if;
  elsif p_document_type = 'job_work' then
    select status into v_status from public.job_work_orders where id = p_document_id;
    if v_status in ('draft', 'pending_signature') then
      return jsonb_build_object('error', 'This job-work order is still in progress — use the normal Sign action instead.');
    end if;
  end if;

  return public._record_signature(p_document_type, p_document_id, p_signature_id, p_actor);
end; $$;
revoke all on function public.backfill_signature(text, uuid, uuid, uuid) from public, anon;
grant execute on function public.backfill_signature(text, uuid, uuid, uuid) to authenticated;
