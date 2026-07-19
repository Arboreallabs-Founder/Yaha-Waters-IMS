-- ============================================================
-- 0025 — Smart multi-level shortfall: consume a stocked sub-assembly,
--        else explode its BOM into component shortfalls (recursively),
--        resolving variants from each line item's selection.
-- Redefines v_project_shortfall so every consumer benefits.
-- ============================================================
create or replace function public.project_shortfall(p_project uuid)
returns table(project_id uuid, component_id uuid, required_qty numeric, ordered_qty numeric, on_hand numeric, shortfall_qty numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_stock jsonb := '{}';   -- component_id::text -> remaining on-hand
  v_order jsonb := '{}';   -- component_id::text -> remaining open PO qty
  v_gross jsonb := '{}';   -- component_id::text -> gross leaf demand
  v_stack jsonb := '[]';   -- DFS stack of {c: comp, q: qty, v: variant_selections}
  v_item  jsonb;
  v_comp  uuid;
  v_qty   numeric;
  v_vsel  jsonb;
  v_net   numeric;
  v_use   numeric;
  v_is_asm boolean;
  v_tpl   uuid;
  v_line  record;
  v_sel   text;
  v_entry jsonb;
  v_childcomp uuid;
  v_childqty  numeric;
  v_len   int;
  v_guard int := 0;
begin
  -- on-hand per component (untagged lots or lots reserved for this project)
  select coalesce(jsonb_object_agg(t.cid::text, t.oh), '{}') into v_stock
  from (select il.component_id cid, sum(il.qty_on_hand) oh from public.inventory_lots il
        where il.status <> 'consumed' and il.qty_on_hand > 0 and il.component_id is not null
          and (il.project_id is null or il.project_id = p_project)
        group by il.component_id) t;

  -- remaining open PO qty per component (this project)
  select coalesce(jsonb_object_agg(t.cid::text, t.oq), '{}') into v_order
  from (select pl.component_id cid, sum(greatest(pl.qty_ordered - pl.qty_received, 0)) oq from public.po_lines pl
        where pl.project_id = p_project and pl.component_id is not null and pl.line_status <> 'cancelled'
        group by pl.component_id) t;

  -- seed from the project's active BOM lines, carrying each line-item's variant selection
  select coalesce(jsonb_agg(jsonb_build_object('c', bl.component_id, 'q', bl.required_qty,
                                               'v', coalesce(pli.variant_selections, '{}'::jsonb))), '[]')
  into v_stack
  from public.boms b
  join public.bom_lines bl on bl.bom_id = b.id
  left join public.project_line_items pli on pli.id = bl.project_line_item_id
  where b.project_id = p_project and bl.component_id is not null;

  while jsonb_array_length(v_stack) > 0 loop
    v_guard := v_guard + 1;
    exit when v_guard > 100000;
    v_len  := jsonb_array_length(v_stack);
    v_item := v_stack -> (v_len - 1);
    v_stack := v_stack - (v_len - 1);            -- pop (DFS)
    v_comp := (v_item->>'c')::uuid;
    v_qty  := (v_item->>'q')::numeric;
    v_vsel := coalesce(v_item->'v', '{}'::jsonb);

    select c.is_assembly into v_is_asm from public.components c where c.id = v_comp;

    if coalesce(v_is_asm, false) then
      -- consume stocked sub-assemblies first; only the remainder must be built (exploded)
      v_use  := least(coalesce((v_stock->>v_comp::text)::numeric, 0), v_qty);
      v_stock := jsonb_set(v_stock, array[v_comp::text], to_jsonb(coalesce((v_stock->>v_comp::text)::numeric,0) - v_use));
      v_net  := v_qty - v_use;
      v_use  := least(coalesce((v_order->>v_comp::text)::numeric, 0), v_net);
      v_order := jsonb_set(v_order, array[v_comp::text], to_jsonb(coalesce((v_order->>v_comp::text)::numeric,0) - v_use));
      v_net  := v_net - v_use;
      continue when v_net <= 0;

      select bt.id into v_tpl from public.bom_templates bt where bt.component_id = v_comp and bt.is_active limit 1;
      if v_tpl is null then
        v_gross := jsonb_set(v_gross, array[v_comp::text], to_jsonb(coalesce((v_gross->>v_comp::text)::numeric,0) + v_net));
      else
        for v_line in select * from public.bom_template_lines btl where btl.bom_template_id = v_tpl loop
          if v_line.is_variant_driven then
            v_sel := v_vsel ->> (v_line.variant_rule ->> 'param');
            v_entry := v_line.variant_rule -> 'map' -> v_sel;
            v_childcomp := null;
            if v_entry is not null then
              select c.id into v_childcomp from public.components c where lower(c.component_no) = lower(v_entry->>'component_no');
              v_childqty := coalesce((v_entry->>'qty')::numeric, 1) * v_net;
            end if;
          else
            v_childcomp := v_line.component_id;
            v_childqty  := coalesce(v_line.quantity, 0) * v_net;
          end if;
          if v_childcomp is not null and coalesce(v_childqty,0) > 0 then
            v_stack := v_stack || jsonb_build_array(jsonb_build_object('c', v_childcomp, 'q', v_childqty, 'v', v_vsel));
          end if;
        end loop;
      end if;
    else
      -- leaf: accumulate gross demand (netted against its own stock/orders at emit)
      v_gross := jsonb_set(v_gross, array[v_comp::text], to_jsonb(coalesce((v_gross->>v_comp::text)::numeric,0) + v_qty));
    end if;
  end loop;

  return query
  select p_project,
         (e.key)::uuid,
         (e.value)::numeric,
         coalesce((v_order->>e.key)::numeric, 0),
         coalesce((v_stock->>e.key)::numeric, 0),
         greatest((e.value)::numeric - coalesce((v_stock->>e.key)::numeric,0) - coalesce((v_order->>e.key)::numeric,0), 0)
  from jsonb_each(v_gross) e;
end; $$;

grant execute on function public.project_shortfall(uuid) to authenticated;
revoke execute on function public.project_shortfall(uuid) from anon, public;

-- Redefine the shortfall view to use the recursive explosion (all consumers benefit).
create or replace view public.v_project_shortfall with (security_invoker = true) as
select ps.*
from public.projects pr
cross join lateral public.project_shortfall(pr.id) ps;

grant select on public.v_project_shortfall to authenticated;
