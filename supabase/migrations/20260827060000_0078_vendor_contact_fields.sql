alter table public.vendors
  add column if not exists pan text,
  add column if not exists email text,
  add column if not exists website text;
