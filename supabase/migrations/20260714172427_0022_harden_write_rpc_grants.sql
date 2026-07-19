-- ============================================================
-- 0022 — Harden sensitive write RPCs: not callable by anon.
-- These SECURITY DEFINER functions mutate stock/lots and take a caller-supplied
-- user id, so they must only be reachable by authenticated server actions.
-- ============================================================
revoke execute on function public.dispatch_job_work(uuid, uuid)          from anon, public;
revoke execute on function public.receive_job_work(uuid, numeric, uuid)  from anon, public;
revoke execute on function public.issue_requisition(uuid, uuid)          from anon, public;
