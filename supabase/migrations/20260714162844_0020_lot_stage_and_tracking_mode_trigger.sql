-- ============================================================
-- 0020 — Lot JW stage / lineage / container + tracking-mode-aware lot creation
-- ============================================================

create type public.jw_stage as enum ('raw', 'completed');

alter table public.inventory_lots
  add column jw_stage      public.jw_stage,                                -- null = not a JW item
  add column parent_lot_id uuid references public.inventory_lots(id),      -- completed lot <- raw lot
  add column container_no  text;                                          -- human box label (box mode)

create index idx_lots_parent on public.inventory_lots(parent_lot_id);

-- grn_lines can target an existing box lot (add pieces to a box instead of a new lot)
alter table public.grn_lines
  add column target_lot_id uuid references public.inventory_lots(id);

-- Rework lot creation on GRN post to honour the component's tracking_mode.
create or replace function public.grn_line_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_track  public.tracking_mode;
  v_is_ser boolean;
  v_is_jw  boolean;
  v_stage  public.jw_stage;
  v_vendor uuid;
  v_lot    uuid;
  v_code   text;
  v_n      int;
  i        int;
begin
  select tracking_mode, is_serialized, is_job_work
    into v_track, v_is_ser, v_is_jw
    from public.components where id = NEW.component_id;
  v_stage  := case when coalesce(v_is_jw, false) then 'raw'::public.jw_stage else null end;
  v_vendor := (select vendor_id from public.grns where id = NEW.grn_id);

  -- (a) Add-to-existing-box: no new lot, just a receipt movement into the chosen box.
  if NEW.target_lot_id is not null then
    insert into public.stock_movements(
      lot_id, component_id, movement_type, qty, project_id,
      reference_type, reference_id, performed_by, created_by)
    values (NEW.target_lot_id, NEW.component_id, 'receipt', NEW.qty_received, NEW.project_id,
      'grn', NEW.id, NEW.created_by, NEW.created_by);
    return NEW;
  end if;

  -- (b) Item tracking: one lot (one QR) per physical piece.
  if v_track = 'item' and NEW.qty_received = floor(NEW.qty_received)
     and NEW.qty_received > 0 and NEW.qty_received <= 1000 then
    v_n := NEW.qty_received::int;
    for i in 1..v_n loop
      v_code := 'LOT-' || to_char(now(), 'YYMMDD') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      insert into public.inventory_lots(
        lot_code, component_id, grn_line_id, vendor_id, project_id,
        qty_on_hand, qty_initial, unit_cost, is_serialized, status, jw_stage, created_by)
      values (v_code, NEW.component_id, NEW.id, v_vendor, NEW.project_id,
        0, 1, NEW.unit_cost, true, 'open', v_stage, NEW.created_by)
      returning id into v_lot;
      insert into public.stock_movements(
        lot_id, component_id, movement_type, qty, project_id,
        reference_type, reference_id, performed_by, created_by)
      values (v_lot, NEW.component_id, 'receipt', 1, NEW.project_id,
        'grn', NEW.id, NEW.created_by, NEW.created_by);
    end loop;
    return NEW;
  end if;

  -- (c) Box / bulk (default): one lot for the whole receipt.
  v_code := 'LOT-' || to_char(now(), 'YYMMDD') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  insert into public.inventory_lots(
    lot_code, component_id, grn_line_id, vendor_id, project_id,
    qty_on_hand, qty_initial, unit_cost, is_serialized, status, jw_stage,
    container_no, created_by)
  values (v_code, NEW.component_id, NEW.id, v_vendor, NEW.project_id,
    0, NEW.qty_received, NEW.unit_cost, coalesce(v_is_ser, false), 'open', v_stage,
    case when v_track = 'box' then v_code else null end, NEW.created_by)
  returning id into v_lot;
  insert into public.stock_movements(
    lot_id, component_id, movement_type, qty, project_id,
    reference_type, reference_id, performed_by, created_by)
  values (v_lot, NEW.component_id, 'receipt', NEW.qty_received, NEW.project_id,
    'grn', NEW.id, NEW.created_by, NEW.created_by);
  return NEW;
end; $$;
