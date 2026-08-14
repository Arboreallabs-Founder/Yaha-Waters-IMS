-- ============================================================
-- 0066 — Backfill jw_stage for lots whose component's is_job_work
-- flag was turned on after stock was already received, plus a
-- trigger so this never silently breaks again.
--
-- grn_line_after_insert() only stamps jw_stage='raw' at receipt time,
-- based on components.is_job_work AT THAT MOMENT. If the flag flips
-- true later, existing open lots stay jw_stage=NULL forever — invisible
-- to the Job Work raw-stock picker (.eq("jw_stage","raw")) even though
-- they're genuine available stock. is_job_work is written via a plain
-- .update() (upsertRecord in src/lib/server/crud.ts), not an RPC, so a
-- trigger is the only place that guarantees this fires regardless of
-- write path (same rationale as 0043's po_lines gate).
-- ============================================================

-- One-time backfill for components already toggled on, so the trigger
-- below only has to guard the future.
update public.inventory_lots l
   set jw_stage = 'raw'
  from public.components c
 where l.component_id = c.id
   and c.is_job_work = true
   and l.status = 'open'
   and l.jw_stage is null;

-- Re-run the same backfill whenever a component's is_job_work flips to
-- true (false/null -> true). Scoped narrowly so it's a no-op on every
-- other components edit.
create or replace function public.backfill_jw_stage_on_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.inventory_lots
     set jw_stage = 'raw'
   where component_id = new.id
     and status = 'open'
     and jw_stage is null;
  return new;
end; $$;

create trigger trg_components_jw_stage_backfill
  after update on public.components
  for each row
  when (new.is_job_work = true and old.is_job_work is distinct from new.is_job_work)
  execute function public.backfill_jw_stage_on_flag();
