-- ============================================================
-- 0010 — RLS policies + grants
-- ============================================================

-- project-access helper (security definer -> avoids RLS recursion)
create or replace function public.auth_can_access_project(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.auth_is_staff() then true
    when p is null then true                              -- stock / no-project rows visible to all
    else exists (select 1 from public.projects pr
                 where pr.id = p and pr.team_id = public.auth_team_id())
  end;
$$;
revoke all on function public.auth_can_access_project(uuid) from public, anon;
grant execute on function public.auth_can_access_project(uuid) to authenticated;

-- ---- base grants (RLS is the real gate) --------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ============================================================
-- Masters: read = all authenticated; write = admin/team_lead
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['categories','products','product_variant_params','components',
                           'bom_templates','bom_template_lines','vendors','vendor_components']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (true);', t||'_sel', t);
    execute format($f$create policy %I on public.%I for all to authenticated
      using (public.auth_role() in ('admin','team_lead'))
      with check (public.auth_role() in ('admin','team_lead'));$f$, t||'_mod', t);
  end loop;
end $$;

-- ============================================================
-- Auth/org
-- ============================================================
create policy profiles_sel on public.profiles for select to authenticated
  using (id = auth.uid() or public.auth_is_staff() or team_id = public.auth_team_id());
create policy profiles_mod on public.profiles for all to authenticated
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');

create policy teams_sel on public.teams for select to authenticated using (true);
create policy teams_mod on public.teams for all to authenticated
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');

-- ============================================================
-- Projects
-- ============================================================
create policy projects_sel on public.projects for select to authenticated
  using (public.auth_is_staff() or team_id = public.auth_team_id());
create policy projects_ins on public.projects for insert to authenticated
  with check (public.auth_role() = 'admin'
              or (public.auth_role() = 'team_lead' and team_id = public.auth_team_id()));
create policy projects_upd on public.projects for update to authenticated
  using (public.auth_role() in ('admin','founder')
         or (public.auth_role() = 'team_lead' and team_id = public.auth_team_id()))
  with check (public.auth_role() in ('admin','founder')
         or (public.auth_role() = 'team_lead' and team_id = public.auth_team_id()));
create policy projects_del on public.projects for delete to authenticated
  using (public.auth_role() = 'admin');

-- ============================================================
-- Project-scoped children: select via can_access; write admin or team of project
-- ============================================================
-- project_line_items
create policy pli_sel on public.project_line_items for select to authenticated
  using (public.auth_can_access_project(project_id));
create policy pli_mod on public.project_line_items for all to authenticated
  using (public.auth_role() = 'admin'
         or (public.auth_role() in ('team_lead','team_member') and public.auth_can_access_project(project_id)))
  with check (public.auth_role() = 'admin'
         or (public.auth_role() in ('team_lead','team_member') and public.auth_can_access_project(project_id)));

-- project_documents (+ founder approval update)
create policy pd_sel on public.project_documents for select to authenticated
  using (public.auth_can_access_project(project_id));
create policy pd_mod on public.project_documents for all to authenticated
  using (public.auth_role() = 'admin'
         or (public.auth_role() in ('team_lead','team_member') and public.auth_can_access_project(project_id)))
  with check (public.auth_role() = 'admin'
         or (public.auth_role() in ('team_lead','team_member') and public.auth_can_access_project(project_id)));
create policy pd_founder_upd on public.project_documents for update to authenticated
  using (public.auth_role() = 'founder') with check (public.auth_role() = 'founder');

-- boms (+ founder approval update)
create policy boms_sel on public.boms for select to authenticated
  using (public.auth_can_access_project(project_id));
create policy boms_mod on public.boms for all to authenticated
  using (public.auth_role() = 'admin'
         or (public.auth_role() in ('team_lead','team_member') and public.auth_can_access_project(project_id)))
  with check (public.auth_role() = 'admin'
         or (public.auth_role() in ('team_lead','team_member') and public.auth_can_access_project(project_id)));
create policy boms_founder_upd on public.boms for update to authenticated
  using (public.auth_role() = 'founder') with check (public.auth_role() = 'founder');

-- bom_lines (project via bom_id -> boms)
create policy bom_lines_sel on public.bom_lines for select to authenticated
  using (public.auth_can_access_project((select b.project_id from public.boms b where b.id = bom_id)));
create policy bom_lines_mod on public.bom_lines for all to authenticated
  using (public.auth_role() = 'admin'
         or (public.auth_role() in ('team_lead','team_member')
             and public.auth_can_access_project((select b.project_id from public.boms b where b.id = bom_id))))
  with check (public.auth_role() = 'admin'
         or (public.auth_role() in ('team_lead','team_member')
             and public.auth_can_access_project((select b.project_id from public.boms b where b.id = bom_id))));

-- project_activities
create policy pa_sel on public.project_activities for select to authenticated
  using (public.auth_can_access_project(project_id));
create policy pa_mod on public.project_activities for all to authenticated
  using (public.auth_role() = 'admin'
         or (public.auth_role() in ('team_lead','team_member') and public.auth_can_access_project(project_id)))
  with check (public.auth_role() = 'admin'
         or (public.auth_role() in ('team_lead','team_member') and public.auth_can_access_project(project_id)));

-- finished_goods (project via project_line_item_id)
create policy fg_sel on public.finished_goods for select to authenticated
  using (public.auth_can_access_project((select pli.project_id from public.project_line_items pli where pli.id = project_line_item_id)));
create policy fg_mod on public.finished_goods for all to authenticated
  using (public.auth_role() in ('admin','team_lead','team_member'))
  with check (public.auth_role() in ('admin','team_lead','team_member'));

-- ============================================================
-- Org-wide operational tables (procurement / inventory / ledger)
-- read = all authenticated; writes role-gated
-- ============================================================
-- requisitions / requisition_lines: members may raise; leads update
create policy req_sel on public.requisitions for select to authenticated using (true);
create policy req_ins on public.requisitions for insert to authenticated
  with check (public.auth_role() in ('admin','team_lead','team_member'));
create policy req_upd on public.requisitions for update to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
create policy req_del on public.requisitions for delete to authenticated
  using (public.auth_role() = 'admin');

create policy reqline_sel on public.requisition_lines for select to authenticated using (true);
create policy reqline_ins on public.requisition_lines for insert to authenticated
  with check (public.auth_role() in ('admin','team_lead','team_member'));
create policy reqline_upd on public.requisition_lines for update to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
create policy reqline_del on public.requisition_lines for delete to authenticated
  using (public.auth_role() = 'admin');

-- purchase_orders / po_lines: admin + team_lead
create policy po_sel on public.purchase_orders for select to authenticated using (true);
create policy po_mod on public.purchase_orders for all to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));

create policy poline_sel on public.po_lines for select to authenticated using (true);
create policy poline_mod on public.po_lines for all to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));

-- grns / grn_lines: members post at the gate; leads/admin can tag/edit
create policy grns_sel on public.grns for select to authenticated using (true);
create policy grns_ins on public.grns for insert to authenticated
  with check (public.auth_role() in ('admin','team_lead','team_member'));
create policy grns_upd on public.grns for update to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
create policy grns_del on public.grns for delete to authenticated
  using (public.auth_role() = 'admin');

create policy grnline_sel on public.grn_lines for select to authenticated using (true);
create policy grnline_ins on public.grn_lines for insert to authenticated
  with check (public.auth_role() in ('admin','team_lead','team_member'));
create policy grnline_upd on public.grn_lines for update to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
create policy grnline_del on public.grn_lines for delete to authenticated
  using (public.auth_role() = 'admin');

-- inventory_lots: mostly trigger-created (definer bypasses RLS); manual writes admin/lead
create policy lots_sel on public.inventory_lots for select to authenticated using (true);
create policy lots_mod on public.inventory_lots for all to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));

-- stock_movements: insert-only (immutable). No update/delete policies = denied.
create policy mov_sel on public.stock_movements for select to authenticated using (true);
create policy mov_ins on public.stock_movements for insert to authenticated
  with check (public.auth_role() in ('admin','team_lead','team_member'));
