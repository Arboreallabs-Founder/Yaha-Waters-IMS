-- ============================================================
-- 0061 — Fix "function approve_irn(uuid,uuid) is not unique".
--
-- 0060 added a p_remarks parameter to approve_irn via `create or replace`,
-- assuming a trailing default-valued parameter would extend the existing
-- 2-arg function in place. It doesn't: Postgres identifies functions by
-- their full argument signature, so `create or replace` with a different
-- arity creates a NEW overload instead of replacing the old one. Both
-- approve_irn(uuid,uuid) and approve_irn(uuid,uuid,text) have existed
-- side by side since 0060, and any 2-arg call (e.g. submit_irn's internal
-- self-approval call) is ambiguous between them.
-- ============================================================

drop function if exists public.approve_irn(uuid, uuid);
