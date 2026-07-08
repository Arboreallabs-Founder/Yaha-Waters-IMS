-- ============================================================
-- 0001 — extensions, enums, updated_at trigger, auth/org tables, helper fns
-- ============================================================
create extension if not exists pgcrypto;

-- ---- Enums -------------------------------------------------
create type public.role            as enum ('admin','founder','team_lead','team_member');
create type public.project_status  as enum ('planning','doc_approval','procurement','production','dispatched','closed','on_hold');
create type public.doc_type        as enum ('qap','drawing','spec','other');
create type public.doc_status      as enum ('pending','approved','rejected');
create type public.bom_status      as enum ('draft','approved');
create type public.bom_line_source as enum ('template','manual');
create type public.req_status      as enum ('open','partially_ordered','ordered','closed');
create type public.po_status       as enum ('draft','sent','partial','completed','cancelled');
create type public.po_source       as enum ('system','phone');
create type public.po_line_status  as enum ('pending','partial','received','cancelled');
create type public.input_type      as enum ('dropdown','number','text');
create type public.movement_type   as enum ('receipt','issue','adjustment','transfer','return');
create type public.lot_status      as enum ('available','reserved','consumed');
create type public.fg_status       as enum ('in_production','ready','dispatched');

-- ---- updated_at touch trigger ------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---- teams -------------------------------------------------
create table public.teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid               -- FK to profiles added after profiles exists
);
alter table public.teams enable row level security;
create trigger trg_teams_updated before update on public.teams
  for each row execute function public.set_updated_at();

-- ---- profiles (1:1 with auth.users) ------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       public.role not null default 'team_member',
  team_id    uuid references public.teams(id),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid references public.profiles(id)
);
alter table public.profiles enable row level security;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- now wire teams.created_by → profiles
alter table public.teams
  add constraint teams_created_by_fkey foreign key (created_by) references public.profiles(id);

-- ---- security-definer helpers (bypass RLS; read caller's profile) ----
create or replace function public.auth_role()
returns public.role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.auth_team_id()
returns uuid
language sql stable security definer set search_path = public
as $$ select team_id from public.profiles where id = auth.uid() $$;

-- convenience: is the caller admin or founder (full-read roles)
create or replace function public.auth_is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role in ('admin','founder') from public.profiles where id = auth.uid()), false) $$;

revoke all on function public.auth_role()     from public, anon;
revoke all on function public.auth_team_id()  from public, anon;
revoke all on function public.auth_is_staff() from public, anon;
grant execute on function public.auth_role(), public.auth_team_id(), public.auth_is_staff() to authenticated;
