-- ============================================================
-- 0045 — Fix: approve_po_line/reject_po_line's own UPDATE was being
-- silently reverted by trg_po_line_price_gate's "no price-relevant change"
-- short-circuit (found via smoke test) — that branch pins
-- approval_status/approved_by/approved_at/rejection_reason back to OLD
-- whenever rate/component_id are unchanged, which is exactly what the
-- approve/reject RPCs' own UPDATE does. Fix: a session-local GUC flag,
-- settable only from inside these two security-definer RPCs (never
-- reachable by a client directly), that tells the trigger to trust the
-- caller and skip all gating for that one statement.
-- ============================================================

create or replace function public.po_line_price_gate() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role       public.role;
  v_last_rate  numeric;
  v_comp_name  text;
  v_was_pending boolean;
begin
  if coalesce(current_setting('yaha.po_line_approval_bypass', true), '') = 'on' then
    return NEW;
  end if;

  if TG_OP = 'UPDATE' and NEW.rate is not distinct from OLD.rate and NEW.component_id is not distinct from OLD.component_id then
    NEW.approval_status := OLD.approval_status;
    NEW.approved_by := OLD.approved_by;
    NEW.approved_at := OLD.approved_at;
    NEW.rejection_reason := OLD.rejection_reason;
    return NEW;
  end if;

  v_was_pending := (TG_OP = 'UPDATE' and OLD.approval_status = 'pending_approval');

  if NEW.rate is null then
    NEW.approval_status := 'approved';
    NEW.approved_by := null; NEW.approved_at := null; NEW.rejection_reason := null;
    return NEW;
  end if;

  v_role := public.auth_role();

  if v_role is null or v_role = 'admin' then
    NEW.approval_status := 'approved';
    NEW.approved_by := auth.uid(); NEW.approved_at := now(); NEW.rejection_reason := null;
    return NEW;
  end if;

  select rate into v_last_rate
    from public.po_lines
   where component_id = NEW.component_id and approval_status = 'approved' and rate is not null
   order by coalesce(approved_at, created_at) desc limit 1;

  if v_last_rate is null or NEW.rate <= v_last_rate then
    NEW.approval_status := 'approved';
    NEW.approved_by := null; NEW.approved_at := null; NEW.rejection_reason := null;
    return NEW;
  end if;

  NEW.approval_status := 'pending_approval';
  NEW.approved_by := null; NEW.approved_at := null; NEW.rejection_reason := null;

  if not v_was_pending then
    select name into v_comp_name from public.components where id = NEW.component_id;
    insert into public.notifications(type, message, link_path, created_by)
    values (
      'po_price_approval',
      format('Price approval needed: %s at ₹%s (last approved ₹%s)', coalesce(v_comp_name, 'component'), NEW.rate, v_last_rate),
      '/purchase-orders/' || NEW.po_id,
      auth.uid()
    );
  end if;

  return NEW;
end; $$;

create or replace function public.approve_po_line(p_line_id uuid, p_approver_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role public.role;
begin
  select role into v_role from public.profiles where id = p_approver_id;
  if v_role is distinct from 'admin' then
    return jsonb_build_object('error', 'Only Admin can approve a PO line price.');
  end if;

  perform set_config('yaha.po_line_approval_bypass', 'on', true);
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

  perform set_config('yaha.po_line_approval_bypass', 'on', true);
  update public.po_lines
     set approval_status = 'rejected', approved_by = p_approver_id, approved_at = now(), rejection_reason = p_reason
   where id = p_line_id and approval_status = 'pending_approval';
  if not found then return jsonb_build_object('error', 'Line not pending approval'); end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.reject_po_line(uuid, uuid, text) to authenticated;
