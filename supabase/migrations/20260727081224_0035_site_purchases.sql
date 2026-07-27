-- ============================================================
-- 0035 — Site Purchase module: one-step buy+consume for on-site
-- materials, landing directly on the project's approved BOM. No QR
-- sticker is ever printed for these — the lot is created and consumed
-- (receipt + issue, net zero on-hand) in the same transaction, purely
-- for costing/audit parity with v_project_consumption/v_component_on_hand.
-- Also adds a manager/admin notification inbox (new — nothing existed
-- before this), since material is landing on a locked/approved BOM
-- without their upfront sign-off.
-- ============================================================

alter type public.bom_line_source add value if not exists 'site_purchase';

create sequence if not exists public.seq_site_purchase_no;
grant usage on sequence public.seq_site_purchase_no to authenticated;

create or replace function public.next_site_purchase_no() returns text
  language sql set search_path = public as $$
  select 'SP/' || public.fiscal_year_label() || '/' || lpad(nextval('public.seq_site_purchase_no')::text,4,'0');
$$;
grant execute on function public.next_site_purchase_no() to authenticated;

-- ---- site_purchases (the audit/log record) -------------------
create table public.site_purchases (
  id           uuid primary key default gen_random_uuid(),
  purchase_no  text not null unique,
  project_id   uuid not null references public.projects(id),
  component_id uuid not null references public.components(id),
  qty          numeric not null,
  unit_cost    numeric,
  vendor_id    uuid references public.vendors(id),
  vendor_name  text,
  note         text,
  lot_id       uuid references public.inventory_lots(id),
  bom_line_id  uuid references public.bom_lines(id),
  purchased_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id)
);
alter table public.site_purchases enable row level security;
create index idx_site_purchases_project on public.site_purchases(project_id);
create index idx_site_purchases_component on public.site_purchases(component_id);

create policy sp_sel on public.site_purchases for select to authenticated using (true);
create policy sp_mod on public.site_purchases for all to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
grant select, insert, update, delete on public.site_purchases to authenticated;

-- ---- notifications (manager/admin inbox — new infra) ----------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  type       text not null,
  project_id uuid references public.projects(id),
  message    text not null,
  link_path  text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);
alter table public.notifications enable row level security;
create index idx_notifications_created on public.notifications(created_at desc);

create policy notif_sel on public.notifications for select to authenticated
  using (public.auth_role() in ('admin','team_lead'));
create policy notif_mod on public.notifications for all to authenticated
  using (public.auth_role() in ('admin','team_lead')) with check (public.auth_role() in ('admin','team_lead'));
grant select, insert, update, delete on public.notifications to authenticated;

create table public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, profile_id)
);
alter table public.notification_reads enable row level security;

create policy notifread_sel on public.notification_reads for select to authenticated
  using (profile_id = auth.uid());
create policy notifread_ins on public.notification_reads for insert to authenticated
  with check (profile_id = auth.uid());
grant select, insert on public.notification_reads to authenticated;

-- ---- RPC: buy + consume in one step, notify manager/admin ------
create or replace function public.create_site_purchase(
  p_project uuid, p_component uuid, p_qty numeric, p_unit_cost numeric,
  p_vendor uuid, p_vendor_name text, p_note text, p_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_bom      record;
  v_bomline  uuid;
  v_lot      uuid;
  v_code     text;
  v_purchase uuid;
  v_pno      text;
  v_comp     record;
  v_proj     record;
  v_buyer    text;
begin
  if p_qty is null or p_qty <= 0 then
    return jsonb_build_object('error','Quantity must be positive');
  end if;
  if p_component is null then
    return jsonb_build_object('error','Pick a component');
  end if;

  select b.id, b.status into v_bom from public.boms b where b.project_id = p_project;
  if v_bom.id is null or v_bom.status is distinct from 'approved' then
    return jsonb_build_object('error','Approve the BOM before logging a site purchase.');
  end if;

  select * into v_comp from public.components where id = p_component;
  select project_no into v_proj from public.projects where id = p_project;
  select full_name into v_buyer from public.profiles where id = p_user_id;

  v_code := 'SP-' || to_char(now(),'YYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,8);
  insert into public.inventory_lots(lot_code, component_id, vendor_id, project_id,
        qty_on_hand, qty_initial, unit_cost, is_serialized, status, created_by)
  values (v_code, p_component, p_vendor, p_project, 0, p_qty, p_unit_cost,
        coalesce(v_comp.is_serialized,false), 'open', p_user_id)
  returning id into v_lot;

  insert into public.stock_movements(lot_id, component_id, movement_type, qty, project_id,
        reference_type, performed_by, created_by)
  values (v_lot, p_component, 'receipt', p_qty, p_project, 'site_purchase', p_user_id, p_user_id);
  insert into public.stock_movements(lot_id, component_id, movement_type, qty, project_id,
        reference_type, performed_by, created_by)
  values (v_lot, p_component, 'issue', -p_qty, p_project, 'site_purchase', p_user_id, p_user_id);

  select bl.id into v_bomline from public.bom_lines bl
    where bl.bom_id = v_bom.id and bl.component_id = p_component limit 1;
  if v_bomline is null then
    insert into public.bom_lines(bom_id, component_id, required_qty, source, note, created_by)
    values (v_bom.id, p_component, p_qty, 'site_purchase', 'Added via site purchase', p_user_id)
    returning id into v_bomline;
  end if;

  select public.next_site_purchase_no() into v_pno;
  insert into public.site_purchases(purchase_no, project_id, component_id, qty, unit_cost,
        vendor_id, vendor_name, note, lot_id, bom_line_id, created_by)
  values (v_pno, p_project, p_component, p_qty, p_unit_cost, p_vendor, p_vendor_name, p_note,
        v_lot, v_bomline, p_user_id)
  returning id into v_purchase;

  insert into public.notifications(type, project_id, message, link_path, created_by)
  values ('site_purchase', p_project,
    format('%s logged a site purchase on %s: %s x %s%s',
      coalesce(v_buyer, 'Someone'),
      coalesce(v_proj.project_no, 'a project'),
      p_qty,
      coalesce(v_comp.name, 'a component'),
      case when p_vendor_name is not null and length(trim(p_vendor_name)) > 0
           then ' from ' || p_vendor_name else '' end),
    '/projects/' || p_project, p_user_id);

  return jsonb_build_object('ok', true, 'id', v_purchase, 'purchase_no', v_pno);
end; $$;
grant execute on function public.create_site_purchase(uuid,uuid,numeric,numeric,uuid,text,text,uuid) to authenticated;
