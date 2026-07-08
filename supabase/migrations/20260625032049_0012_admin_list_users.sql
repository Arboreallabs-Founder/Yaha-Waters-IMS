-- Admin-only listing of users with their auth email (joins auth.users).
-- Gated inside the function: non-admin callers get zero rows.
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  role public.role,
  team_id uuid,
  is_active boolean,
  created_at timestamptz
)
language sql stable security definer set search_path = public, auth as $$
  select p.id, u.email::text, p.full_name, p.role, p.team_id, p.is_active, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.auth_role() = 'admin'
  order by p.created_at;
$$;

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;
