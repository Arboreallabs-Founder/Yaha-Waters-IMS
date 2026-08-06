-- ============================================================
-- 0040 — Read-only preview of the next PO number, for pre-filling the
-- manual-entry field on "New PO" without burning/skipping a real number.
-- next_po_no() itself can't be used for a preview since every call
-- permanently advances the sequence, even if the dialog is cancelled.
-- ============================================================

create or replace function public.peek_next_po_no() returns text
  language sql stable set search_path = public as $$
  select 'PO/' || public.fiscal_year_label() || '/' || lpad(
    (case when is_called then last_value + 1 else last_value end)::text, 4, '0'
  )
  from seq_po_no;
$$;
grant execute on function public.peek_next_po_no() to authenticated;
