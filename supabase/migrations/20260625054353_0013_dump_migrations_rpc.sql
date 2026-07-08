-- Service-role-only helper to mirror applied migrations into the repo (dev tooling).
create or replace function public.dump_migrations()
returns table (version text, name text, statements text[])
language sql stable security definer set search_path = supabase_migrations, public as $$
  select version, name, statements from supabase_migrations.schema_migrations order by version
$$;
revoke all on function public.dump_migrations() from public, anon, authenticated;
grant execute on function public.dump_migrations() to service_role;
