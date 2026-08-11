-- ============================================================
-- 0041 — Fully remove the Teams / RLS team-scoping mechanism.
-- Confirmed a no-op in practice before this migration: 0 rows in teams,
-- 0 profiles/projects have a team_id, all real users are admin (which
-- already bypasses team checks via auth_is_staff()). auth_role() and
-- auth_is_staff() are NOT team-specific and are left untouched — they're
-- used broadly across unrelated RLS policies.
-- ============================================================

-- ---- 1. project-scoped children: drop team/project gating on selects ----
drop policy if exists pli_sel on public.project_line_items;
create policy pli_sel on public.project_line_items for select to authenticated using (true);

drop policy if exists pd_sel on public.project_documents;
create policy pd_sel on public.project_documents for select to authenticated using (true);

drop policy if exists boms_sel on public.boms;
create policy boms_sel on public.boms for select to authenticated using (true);

drop policy if exists bom_lines_sel on public.bom_lines;
create policy bom_lines_sel on public.bom_lines for select to authenticated using (true);

drop policy if exists pa_sel on public.project_activities;
create policy pa_sel on public.project_activities for select to authenticated using (true);

drop policy if exists fg_sel on public.finished_goods;
create policy fg_sel on public.finished_goods for select to authenticated using (true);

-- ---- 2. same tables: drop project-scoping on writes, role-only now ----
drop policy if exists pli_mod on public.project_line_items;
create policy pli_mod on public.project_line_items for all to authenticated
  using (public.auth_role() in ('admin','team_lead','team_member'))
  with check (public.auth_role() in ('admin','team_lead','team_member'));

drop policy if exists pd_mod on public.project_documents;
create policy pd_mod on public.project_documents for all to authenticated
  using (public.auth_role() in ('admin','team_lead','team_member'))
  with check (public.auth_role() in ('admin','team_lead','team_member'));

drop policy if exists boms_mod on public.boms;
create policy boms_mod on public.boms for all to authenticated
  using (public.auth_role() in ('admin','team_lead','team_member'))
  with check (public.auth_role() in ('admin','team_lead','team_member'));

drop policy if exists bom_lines_mod on public.bom_lines;
create policy bom_lines_mod on public.bom_lines for all to authenticated
  using (public.auth_role() in ('admin','team_lead','team_member'))
  with check (public.auth_role() in ('admin','team_lead','team_member'));

drop policy if exists pa_mod on public.project_activities;
create policy pa_mod on public.project_activities for all to authenticated
  using (public.auth_role() in ('admin','team_lead','team_member'))
  with check (public.auth_role() in ('admin','team_lead','team_member'));

-- ---- 3. profiles: drop the "see your teammates" carve-out ----
drop policy if exists profiles_sel on public.profiles;
create policy profiles_sel on public.profiles for select to authenticated
  using (id = auth.uid() or public.auth_is_staff());

-- ---- 4. projects: drop team scoping ----
drop policy if exists projects_sel on public.projects;
create policy projects_sel on public.projects for select to authenticated using (true);

drop policy if exists projects_ins on public.projects;
create policy projects_ins on public.projects for insert to authenticated
  with check (public.auth_role() in ('admin','team_lead'));

drop policy if exists projects_upd on public.projects;
create policy projects_upd on public.projects for update to authenticated
  using (public.auth_role() in ('admin','founder','team_lead'))
  with check (public.auth_role() in ('admin','founder','team_lead'));
-- projects_del unchanged (admin only, already team-independent)

-- ---- 5. teams table policies ----
drop policy if exists teams_sel on public.teams;
drop policy if exists teams_mod on public.teams;

-- ---- 6. drop the team-scoping helper functions ----
drop function if exists public.auth_can_access_project(uuid);
drop function if exists public.auth_team_id();

-- ---- 7. drop the view that depends on projects.team_id, before the column ----
drop view if exists public.v_projects_safe;
create view public.v_projects_safe with (security_invoker = true) as
select id, project_no, customer_id, customer_po_number, order_date, status,
       delivery_date, dispatch_date, created_at, updated_at, created_by
from public.projects;

-- ---- 8. drop columns / table ----
drop index if exists public.idx_projects_team;
alter table public.projects drop column if exists team_id;
alter table public.profiles drop column if exists team_id;
drop table if exists public.teams;

-- ---- 9. admin_list_users(): drop team_id from the return shape ----
drop function if exists public.admin_list_users();
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  role public.role,
  is_active boolean,
  created_at timestamptz
)
language sql stable security definer set search_path = public, auth as $$
  select p.id, u.email::text, p.full_name, p.role, p.is_active, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.auth_role() = 'admin'
  order by p.created_at;
$$;
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;
