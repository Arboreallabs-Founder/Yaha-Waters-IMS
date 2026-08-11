-- ============================================================
-- 0044 — PO line price approval: approve/reject RPCs
-- Structurally mirrors approve_irn/reject_irn (0037_irn_rpcs.sql), with
-- one deliberate difference: only 'admin' may approve/reject, not
-- 'admin'/'team_lead' — team_lead is the role being gated by this
-- workflow, so letting team_lead also approve would let them rubber-stamp
-- their own price increase.
-- ============================================================

create or replace function public.approve_po_line(p_line_id uuid, p_approver_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role public.role;
begin
  select role into v_role from public.profiles where id = p_approver_id;
  if v_role is distinct from 'admin' then
    return jsonb_build_object('error', 'Only Admin can approve a PO line price.');
  end if;

  update public.po_lines
     set approval_status = 'approved', approved_by = p_approver_id, approved_at = now(), rejection_reason = null
   where id = p_line_id and approval_status = 'pending_approval';
  if not found then return jsonb_build_object('error', 'Line not pending approval'); end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.approve_po_line(uuid, uuid) to authenticated;

create or replace function public.reject_po_line(p_line_id uuid, p_approver_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role public.role;
begin
  select role into v_role from public.profiles where id = p_approver_id;
  if v_role is distinct from 'admin' then
    return jsonb_build_object('error', 'Only Admin can reject a PO line price.');
  end if;

  update public.po_lines
     set approval_status = 'rejected', approved_by = p_approver_id, approved_at = now(), rejection_reason = p_reason
   where id = p_line_id and approval_status = 'pending_approval';
  if not found then return jsonb_build_object('error', 'Line not pending approval'); end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.reject_po_line(uuid, uuid, text) to authenticated;
