-- ============================================================
-- 0071 — grn_line_before_insert() flagged is_untagged=true whenever a
-- GRN line had no po_line_id, regardless of whether project_id was
-- already set. Job-work receipts never have a po_line_id (they use
-- jw_line_id instead) but DO carry a real project_id from the job-work
-- order, so every job-work return was wrongly landing in the "Untagged
-- receipts (received with no PO)" report asking to re-tag a project
-- that's already correctly recorded. Now only flags a line untagged
-- when it truly has neither a PO nor a project.
--
-- Only changes future inserts — deliberately does NOT touch any
-- existing grn_lines.is_untagged values, so already-received rows are
-- unaffected by this migration.
-- ============================================================

create or replace function public.grn_line_before_insert()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.po_line_id is null and new.project_id is null then new.is_untagged := true; end if;
  return new;
end; $function$;
