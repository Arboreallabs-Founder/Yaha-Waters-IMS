-- ============================================================
-- 0021 — Job Work orders: dispatch raw -> receive completed (cost = raw + JW)
-- ============================================================

create sequence if not exists public.seq_jw_no;
grant usage on sequence public.seq_jw_no to authenticated;

create or replace function public.next_jw_no()
returns text language sql set search_path = public as $$
  select 'JW/' || public.fiscal_year_label() || '/' || lpad(nextval('public.seq_jw_no')::text, 4, '0');
$$;
grant execute on function public.next_jw_no() to authenticated;

-- ---- job_work_orders ----------------------------------------
create table public.job_work_orders (
  id            uuid primary key default gen_random_uuid(),
  jw_no         text not null unique,
  vendor_id     uuid references public.vendors(id),        -- the job-work vendor
  project_id    uuid references public.projects(id),       -- nullable = stock
  status        text not null default 'draft'
                  check (status in ('draft','sent','partial','received','cancelled')),
  sent_date     date,
  expected_date date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  created_by    uuid references public.profiles(id)
);
alter table public.job_work_orders enable row level security;
create trigger trg_jwo_updated before update on public.job_work_orders
  for each row execute function public.set_updated_at();
create index idx_jwo_vendor  on public.job_work_orders(vendor_id);
create index idx_jwo_project on public.job_work_orders(project_id);

-- ---- job_work_lines -----------------------------------------
create table public.job_work_lines (
  id               uuid primary key default gen_random_uuid(),
  jw_order_id      uuid not null references public.job_work_orders(id) on delete cascade,
  component_id     uuid references public.components(id),
  raw_lot_id       uuid references public.inventory_lots(id),   -- raw stock sent out
  qty_sent         numeric not null default 0,
  qty_returned     numeric not null default 0,                  -- rolled up on receive
  completed_lot_id uuid references public.inventory_lots(id),   -- latest completed lot produced
  jw_rate          numeric,                                     -- per-unit job-work price (overrides component)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,
  created_by       uuid references public.profiles(id)
);
alter table public.job_work_lines enable row level security;
create trigger trg_jwl_updated before update on public.job_work_lines
  for each row execute function public.set_updated_at();
create index idx_jwl_order on public.job_work_lines(jw_order_id);
create index idx_jwl_component on public.job_work_lines(component_id);

-- ---- RLS (read: all authenticated; write: admin + team_lead) --
create policy jwo_sel on public.job_work_orders for select using (true);
create policy jwo_mod on public.job_work_orders for all
  using (auth_role() = any (array['admin'::role,'team_lead'::role]))
  with check (auth_role() = any (array['admin'::role,'team_lead'::role]));
create policy jwl_sel on public.job_work_lines for select using (true);
create policy jwl_mod on public.job_work_lines for all
  using (auth_role() = any (array['admin'::role,'team_lead'::role]))
  with check (auth_role() = any (array['admin'::role,'team_lead'::role]));

grant select, insert, update, delete on public.job_work_orders to authenticated;
grant select, insert, update, delete on public.job_work_lines  to authenticated;

-- ---- dispatch: issue raw lots out to the JW vendor -----------
create or replace function public.dispatch_job_work(p_order_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order record;
  v_line  record;
  v_lot   record;
begin
  select * into v_order from public.job_work_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('error','Order not found'); end if;
  if v_order.status <> 'draft' then
    return jsonb_build_object('error','Only draft orders can be dispatched');
  end if;

  for v_line in select * from public.job_work_lines where jw_order_id = p_order_id loop
    if v_line.raw_lot_id is null then
      raise exception 'JOB_WORK: a line has no raw lot selected';
    end if;
    select * into v_lot from public.inventory_lots where id = v_line.raw_lot_id for update;
    if coalesce(v_lot.qty_on_hand,0) < v_line.qty_sent then
      raise exception 'JOB_WORK: raw lot % has only % (need %)', v_lot.lot_code, v_lot.qty_on_hand, v_line.qty_sent;
    end if;
    insert into public.stock_movements(
      lot_id, component_id, movement_type, qty, project_id,
      reference_type, reference_id, performed_by, created_by)
    values (v_line.raw_lot_id, v_line.component_id, 'issue', -v_line.qty_sent, v_order.project_id,
      'job_work', p_order_id, p_user_id, p_user_id);
  end loop;

  update public.job_work_orders set status='sent', sent_date=current_date where id = p_order_id;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.dispatch_job_work(uuid, uuid) to authenticated;

-- ---- receive: create completed lot(s), cost = raw + JW -------
create or replace function public.receive_job_work(p_line_id uuid, p_qty numeric, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_line  record;
  v_order record;
  v_comp  record;
  v_raw   record;
  v_rate  numeric;
  v_cost  numeric;
  v_code  text;
  v_lot   uuid;
  v_last  uuid;
  v_n     int;
  i       int;
  v_total_sent numeric;
  v_total_ret  numeric;
begin
  select * into v_line from public.job_work_lines where id = p_line_id for update;
  if not found then return jsonb_build_object('error','Job-work line not found'); end if;
  select * into v_order from public.job_work_orders where id = v_line.jw_order_id for update;
  if v_order.status not in ('sent','partial') then
    return jsonb_build_object('error','Order must be dispatched before receiving');
  end if;
  if p_qty is null or p_qty <= 0 then return jsonb_build_object('error','Quantity must be positive'); end if;
  if coalesce(v_line.qty_returned,0) + p_qty > v_line.qty_sent then
    return jsonb_build_object('error','Cannot receive more than was dispatched');
  end if;

  select * into v_comp from public.components where id = v_line.component_id;
  select * into v_raw  from public.inventory_lots where id = v_line.raw_lot_id;
  v_rate := coalesce(v_line.jw_rate, v_comp.jw_rate, 0);
  v_cost := coalesce(v_raw.unit_cost, 0) + v_rate;

  if v_comp.tracking_mode = 'item' and p_qty = floor(p_qty) and p_qty <= 1000 then
    v_n := p_qty::int;
  else
    v_n := 1;
  end if;

  for i in 1..v_n loop
    v_code := 'LOT-' || to_char(now(),'YYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,8);
    insert into public.inventory_lots(
      lot_code, component_id, vendor_id, project_id, parent_lot_id,
      qty_on_hand, qty_initial, unit_cost, is_serialized, status, jw_stage,
      container_no, created_by)
    values (v_code, v_line.component_id, v_order.vendor_id, v_order.project_id, v_line.raw_lot_id,
      0, case when v_n > 1 then 1 else p_qty end, v_cost,
      case when v_comp.tracking_mode = 'item' then true else coalesce(v_comp.is_serialized,false) end,
      'open', 'completed',
      case when v_comp.tracking_mode = 'box' then v_code else null end, p_user_id)
    returning id into v_lot;
    insert into public.stock_movements(
      lot_id, component_id, movement_type, qty, project_id,
      reference_type, reference_id, performed_by, created_by)
    values (v_lot, v_line.component_id, 'receipt', case when v_n > 1 then 1 else p_qty end, v_order.project_id,
      'job_work', v_order.id, p_user_id, p_user_id);
    v_last := v_lot;
  end loop;

  update public.job_work_lines
     set qty_returned = coalesce(qty_returned,0) + p_qty,
         completed_lot_id = v_last
   where id = p_line_id;

  select coalesce(sum(qty_sent),0), coalesce(sum(qty_returned),0)
    into v_total_sent, v_total_ret
    from public.job_work_lines where jw_order_id = v_order.id;
  update public.job_work_orders
     set status = case when v_total_ret >= v_total_sent then 'received' else 'partial' end
   where id = v_order.id;

  return jsonb_build_object('ok', true, 'completed_lot_id', v_last, 'unit_cost', v_cost);
end; $$;
grant execute on function public.receive_job_work(uuid, numeric, uuid) to authenticated;
