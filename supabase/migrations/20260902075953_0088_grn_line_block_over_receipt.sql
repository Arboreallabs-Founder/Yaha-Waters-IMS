-- Block GRN over-receipt: a grn_line may not push a PO line's total received
-- quantity above what was ordered. Backstop for the same check in the
-- addGrnLine server action. Job-work receipts (jw_line_id set, po_line_id null)
-- are unaffected. A 1e-6 epsilon absorbs floating-point noise.

create or replace function public.grn_line_before_insert()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_ord  numeric;
  v_recv numeric;
begin
  if new.po_line_id is null and new.project_id is null then new.is_untagged := true; end if;

  if new.po_line_id is not null and new.jw_line_id is null then
    select qty_ordered, coalesce(qty_received, 0)
      into v_ord, v_recv
      from public.po_lines
     where id = new.po_line_id;

    if v_ord is not null and v_recv + new.qty_received > v_ord + 1e-6 then
      raise exception
        'Over-receipt blocked: PO line has % remaining (ordered %, already received %); this GRN line adds %.',
        (v_ord - v_recv), v_ord, v_recv, new.qty_received
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end; $function$;
