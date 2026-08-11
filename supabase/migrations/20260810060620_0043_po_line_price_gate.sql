-- ============================================================
-- 0043 — PO line price approval: gating trigger
--
-- Rule: admin always self-approves. Any other authenticated role that can
-- reach this table (team_lead, per poline_mod RLS) is gated on price — a
-- rate above the last *approved* rate for that component (any vendor)
-- goes to pending_approval; at/below, or no prior approved rate, auto-
-- approves. A NULL auth_role() (a service-role/import-script context with
-- no user session, e.g. src/lib/import/import-po-status.ts) is treated
-- like admin — auto-approved, no gate — so re-running historical imports
-- doesn't flag a pile of old rows or spam notifications.
--
-- The notifications insert happens inside this trigger, not a separate
-- RPC/action (the usual convention here — see notify_grn_missing_invoice).
-- po_lines has three direct write paths (addPoLine, updatePoLine, the
-- shortfall-raise bulk insert) plus the import script; a trigger is the
-- only place that guarantees the check fires uniformly regardless of
-- entry point.
--
-- NOTE: superseded by migration 0045, which adds a session-local bypass
-- flag so approve_po_line/reject_po_line's own UPDATE isn't reverted by
-- the "no price-relevant change" short-circuit below. Kept here verbatim
-- as originally applied, for migration-history fidelity.
-- ============================================================

create or replace function public.po_line_price_gate() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role       public.role;
  v_last_rate  numeric;
  v_comp_name  text;
  v_was_pending boolean;
begin
  -- 1. No price-relevant change on UPDATE: preserve the existing decision
  -- verbatim from OLD (never trust client-submitted values for these four
  -- columns — this is what stops a team_lead from PATCHing approval_status
  -- directly alongside an untouched rate/component_id).
  if TG_OP = 'UPDATE' and NEW.rate is not distinct from OLD.rate and NEW.component_id is not distinct from OLD.component_id then
    NEW.approval_status := OLD.approval_status;
    NEW.approved_by := OLD.approved_by;
    NEW.approved_at := OLD.approved_at;
    NEW.rejection_reason := OLD.rejection_reason;
    return NEW;
  end if;

  v_was_pending := (TG_OP = 'UPDATE' and OLD.approval_status = 'pending_approval');

  -- 2. No rate entered: nothing to gate.
  if NEW.rate is null then
    NEW.approval_status := 'approved';
    NEW.approved_by := null; NEW.approved_at := null; NEW.rejection_reason := null;
    return NEW;
  end if;

  v_role := public.auth_role();

  -- 3. Admin (or no session — service-role/import context): self-approve.
  if v_role is null or v_role = 'admin' then
    NEW.approval_status := 'approved';
    NEW.approved_by := auth.uid(); NEW.approved_at := now(); NEW.rejection_reason := null;
    return NEW;
  end if;

  -- 4. Gated role (team_lead in practice): compare against last approved rate.
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

create trigger trg_po_line_price_gate before insert or update on public.po_lines
  for each row execute function public.po_line_price_gate();
