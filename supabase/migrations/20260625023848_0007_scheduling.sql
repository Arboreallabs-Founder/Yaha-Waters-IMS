-- ============================================================
-- 0007 — Production scheduling
-- ============================================================

create table public.project_activities (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  activity          text not null,
  responsibility    text,
  planned_date      date,
  actual_date       date,
  variance_days     int generated always as (
                      case when planned_date is not null and actual_date is not null
                           then (actual_date - planned_date) end
                    ) stored,
  status            text,
  material_available boolean,   -- derived later from inventory/PO status
  po_released        boolean,   -- derived later
  delay_reason      text,
  corrective_action text,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  created_by        uuid references public.profiles(id)
);
alter table public.project_activities enable row level security;
create trigger trg_project_activities_updated before update on public.project_activities
  for each row execute function public.set_updated_at();
create index idx_activities_project on public.project_activities(project_id);
