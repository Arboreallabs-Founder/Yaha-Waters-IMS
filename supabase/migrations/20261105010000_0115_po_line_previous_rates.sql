-- The price each PO line's component was last bought at, so the PO screens
-- can warn "↑ ₹105/kg (+28%) vs last price" while editing and when signing.
--
-- "Last price" = the most recent approved rate for the same component on an
-- earlier PO that actually went out (sent / partial / completed, or an older
-- revision of one), by PO date. The PO's own revisions don't count — a
-- revision of the same order is not a previous purchase. Drafts, POs still
-- waiting for approval and cancelled POs don't count either.
--
-- Read-only, runs as the caller (RLS applies), and returns nothing to roles
-- that may not see prices (Inventory Floor never sees a price).

drop function if exists public.po_line_previous_rates(uuid[]);
create function public.po_line_previous_rates(p_po_ids uuid[])
 returns table(po_id uuid, line_id uuid, component_id uuid, rate numeric, previous_rate numeric, previous_po_no text, previous_po_date date)
 language sql
 stable
 set search_path to 'public'
as $function$
  select l.po_id, l.id, l.component_id, l.rate, prev.rate, prev.po_no, prev.po_date
    from public.po_lines l
    join public.purchase_orders po on po.id = l.po_id
    cross join lateral (
      select pl.rate, p2.po_no, coalesce(p2.po_date, p2.created_at::date) as po_date
        from public.po_lines pl
        join public.purchase_orders p2 on p2.id = pl.po_id
       where pl.component_id = l.component_id
         and pl.rate is not null
         and pl.approval_status = 'approved'
         and p2.status in ('sent', 'partial', 'completed', 'superseded')
         and coalesce(p2.root_po_id, p2.id) <> coalesce(po.root_po_id, po.id)
         and coalesce(p2.po_date, p2.created_at::date) <= coalesce(po.po_date, po.created_at::date)
       order by coalesce(p2.po_date, p2.created_at::date) desc, pl.created_at desc
       limit 1
    ) prev
   where l.po_id = any(p_po_ids)
     and l.component_id is not null
     and public.auth_role() = any (array['admin', 'founder', 'team_lead', 'accounts']::public.role[]);
$function$;

revoke all on function public.po_line_previous_rates(uuid[]) from public, anon;
grant execute on function public.po_line_previous_rates(uuid[]) to authenticated;
