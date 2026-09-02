-- ============================================================
-- 0087 — Drop the stale 14-param submit_irn overload left behind
-- when 0080 added p_signature_id: `create or replace function`
-- only replaces a function whose parameter list matches exactly,
-- so 0080 created a second overload instead of replacing the old
-- one. The stale version still calls approve_irn(uuid, uuid) — the
-- 2-arg form that no longer exists since signature-required
-- approval was added — so any caller that happened to resolve to
-- it (e.g. a positional call omitting p_signature_id) would crash.
-- The app itself always calls submit_irn with p_signature_id named
-- explicitly, so it was never affected — this just removes a latent
-- trap for any other caller.
-- ============================================================

drop function public.submit_irn(uuid, uuid, numeric, numeric, uuid, uuid, numeric, numeric, numeric, jsonb, uuid, uuid, numeric, uuid);
