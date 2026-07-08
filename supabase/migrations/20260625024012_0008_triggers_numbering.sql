-- ============================================================
-- 0008 — Triggers & document numbering (derived logic)
-- ============================================================

-- recreate set_updated_at with a fixed search_path (advisor hygiene)
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---- stock_movements -> inventory_lots.qty_on_hand ---------
create or replace function public.recompute_lot_on_hand()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lot uuid; v_sum numeric;
begin
  v_lot := coalesce(new.lot_id, old.lot_id);
  if v_lot is null then return coalesce(new, old); end if;
  select coalesce(sum(qty),0) into v_sum from public.stock_movements where lot_id = v_lot;
  update public.inventory_lots
     set qty_on_hand = v_sum,
         status = case when v_sum <= 0 then 'consumed'::public.lot_status
                       when status = 'consumed' and v_sum > 0 then 'available'::public.lot_status
                       else status end
   where id = v_lot;
  return coalesce(new, old);
end; $$;
create trigger trg_movement_recompute
  after insert or update or delete on public.stock_movements
  for each row execute function public.recompute_lot_on_hand();

-- ---- GRN line: flag untagged, then create lot + receipt move
create or replace function public.grn_line_before_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.po_line_id is null then new.is_untagged := true; end if;
  return new;
end; $$;
create trigger trg_grn_line_before before insert on public.grn_lines
  for each row execute function public.grn_line_before_insert();

create or replace function public.grn_line_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_is_ser boolean; v_lot uuid; v_code text;
begin
  select is_serialized into v_is_ser from public.components where id = new.component_id;
  v_code := 'LOT-' || to_char(now(),'YYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,8);
  insert into public.inventory_lots(lot_code, component_id, grn_line_id, vendor_id, project_id,
        qty_on_hand, qty_initial, unit_cost, is_serialized, status, created_by)
  values (v_code, new.component_id, new.id,
        (select vendor_id from public.grns where id = new.grn_id),
        new.project_id, 0, new.qty_received, new.unit_cost,
        coalesce(v_is_ser,false), 'available', new.created_by)
  returning id into v_lot;
  insert into public.stock_movements(lot_id, component_id, movement_type, qty, project_id,
        reference_type, reference_id, performed_by, created_by)
  values (v_lot, new.component_id, 'receipt', new.qty_received, new.project_id,
        'grn', new.id, new.created_by, new.created_by);
  return new;
end; $$;
create trigger trg_grn_line_after after insert on public.grn_lines
  for each row execute function public.grn_line_after_insert();

-- ---- GRN receipts -> po_lines rollup + PO status -----------
create or replace function public.recompute_po_status(p_po uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n_total int; n_received int; n_partial int; n_cancelled int; v_cur public.po_status;
begin
  select count(*),
         count(*) filter (where line_status='received'),
         count(*) filter (where line_status='partial'),
         count(*) filter (where line_status='cancelled')
    into n_total, n_received, n_partial, n_cancelled
    from public.po_lines where po_id = p_po;
  if n_total = 0 then return; end if;
  select status into v_cur from public.purchase_orders where id = p_po;
  if v_cur = 'cancelled' then return; end if;
  if n_received + n_cancelled = n_total then
    update public.purchase_orders set status='completed' where id=p_po;
  elsif n_received > 0 or n_partial > 0 then
    update public.purchase_orders set status='partial' where id=p_po;
  end if;
end; $$;

create or replace function public.rollup_po_line()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_poline uuid; v_recv numeric; v_ord numeric; v_po uuid; v_status public.po_line_status;
begin
  v_poline := coalesce(new.po_line_id, old.po_line_id);
  if v_poline is null then return coalesce(new, old); end if;
  select coalesce(sum(qty_received),0) into v_recv from public.grn_lines where po_line_id = v_poline;
  select qty_ordered, po_id into v_ord, v_po from public.po_lines where id = v_poline;
  v_status := (case when v_recv <= 0 then 'pending'
                    when v_recv >= v_ord then 'received'
                    else 'partial' end)::public.po_line_status;
  update public.po_lines set qty_received = v_recv, line_status = v_status where id = v_poline;
  perform public.recompute_po_status(v_po);
  return coalesce(new, old);
end; $$;
create trigger trg_rollup_po_line
  after insert or update or delete on public.grn_lines
  for each row execute function public.rollup_po_line();

-- ---- Document numbering (sequences + helpers) --------------
create sequence if not exists public.seq_po_no;
create sequence if not exists public.seq_grn_no;
create sequence if not exists public.seq_req_no;

create or replace function public.fiscal_year_label(d date default current_date)
returns text language sql immutable set search_path = public as $$
  select case when extract(month from d) >= 4
              then to_char(d,'YY') || '-' || to_char(d + interval '1 year','YY')
              else to_char(d - interval '1 year','YY') || '-' || to_char(d,'YY') end;
$$;

create or replace function public.next_po_no() returns text
  language sql set search_path = public as $$
  select 'PO/' || public.fiscal_year_label() || '/' || lpad(nextval('public.seq_po_no')::text,4,'0'); $$;
create or replace function public.next_grn_no() returns text
  language sql set search_path = public as $$
  select 'GRN/' || public.fiscal_year_label() || '/' || lpad(nextval('public.seq_grn_no')::text,4,'0'); $$;
create or replace function public.next_req_no() returns text
  language sql set search_path = public as $$
  select 'REQ/' || public.fiscal_year_label() || '/' || lpad(nextval('public.seq_req_no')::text,4,'0'); $$;

grant execute on function public.next_po_no(), public.next_grn_no(), public.next_req_no(),
  public.fiscal_year_label(date) to authenticated;
