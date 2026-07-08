-- ============================================================
-- 0011 — add missing customers policies; lock trigger functions out of RPC
-- ============================================================

-- customers: read all authenticated; write admin/team_lead (master-like)
create policy customers_sel on public.customers for select to authenticated using (true);
create policy customers_mod on public.customers for all to authenticated
  using (public.auth_role() in ('admin','team_lead'))
  with check (public.auth_role() in ('admin','team_lead'));

-- Trigger functions must never be callable directly via PostgREST RPC.
-- (They run with definer rights inside triggers regardless of these grants.)
revoke all on function public.recompute_lot_on_hand()      from public, anon, authenticated;
revoke all on function public.grn_line_after_insert()      from public, anon, authenticated;
revoke all on function public.grn_line_before_insert()     from public, anon, authenticated;
revoke all on function public.rollup_po_line()             from public, anon, authenticated;
revoke all on function public.recompute_po_status(uuid)    from public, anon, authenticated;
revoke all on function public.set_updated_at()             from public, anon, authenticated;
