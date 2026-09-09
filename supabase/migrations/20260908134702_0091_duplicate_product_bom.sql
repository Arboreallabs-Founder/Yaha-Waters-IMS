-- ============================================================
-- 0091 — duplicate_product_bom(): clone a product's BOM into a new product.
--
-- Creates a new product (copying category / is_serialized / description),
-- a fresh active bom_templates row, all its product_variant_params, and a
-- deep copy of the product template's bom_template_lines with parent_line_id
-- remapped to the copied rows.
--
-- Reusable (promoted) sub-assemblies are SHARED — their component_id and
-- their own sub-templates are left untouched, only referenced. Plain folder
-- lines (line_type='assembly', component_id NULL) and their children are
-- copied inline like any other line.
-- ============================================================

create or replace function public.duplicate_product_bom(p_src_template uuid, p_sku text, p_model text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src   public.bom_templates%rowtype;
  v_prod  public.products%rowtype;
  v_sku   text;
  v_model text;
  v_new_prod uuid;
  v_new_tpl  uuid;
begin
  select * into v_src from public.bom_templates where id = p_src_template;
  if not found or v_src.product_id is null then
    raise exception 'source % is not a product BOM template', p_src_template;
  end if;
  select * into v_prod from public.products where id = v_src.product_id;

  v_sku   := coalesce(nullif(btrim(p_sku), ''),   v_prod.sku_code || '-COPY');
  v_model := coalesce(nullif(btrim(p_model), ''), v_prod.model_name || ' (copy)');

  insert into public.products (sku_code, model_name, category_id, is_serialized, description)
  values (v_sku, v_model, v_prod.category_id, v_prod.is_serialized, v_prod.description)
  returning id into v_new_prod;

  insert into public.bom_templates (product_id, version, is_active)
  values (v_new_prod, 1, true)
  returning id into v_new_tpl;

  insert into public.product_variant_params
    (product_id, name, input_type, options, min_value, max_value, uom, sort_order)
  select v_new_prod, name, input_type, options, min_value, max_value, uom, sort_order
  from public.product_variant_params
  where product_id = v_src.product_id;

  with src as (
    select *, gen_random_uuid() as new_id
    from public.bom_template_lines
    where bom_template_id = p_src_template
  )
  insert into public.bom_template_lines
    (id, bom_template_id, component_id, quantity, is_common, is_variant_driven,
     variant_rule, note, parent_line_id, line_type, section, assembly_name,
     sort_order, variant_group, variation)
  select s.new_id, v_new_tpl, s.component_id, s.quantity, s.is_common, s.is_variant_driven,
         s.variant_rule, s.note, p.new_id, s.line_type, s.section, s.assembly_name,
         s.sort_order, s.variant_group, s.variation
  from src s
  left join src p on p.id = s.parent_line_id;

  return v_new_tpl;
end;
$$;

grant execute on function public.duplicate_product_bom(uuid, text, text) to authenticated;
revoke execute on function public.duplicate_product_bom(uuid, text, text) from anon, public;
