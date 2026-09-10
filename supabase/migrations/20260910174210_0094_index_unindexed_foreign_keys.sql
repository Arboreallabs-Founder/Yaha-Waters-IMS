-- 0094: index every foreign key that has no covering index.
--
-- Postgres does not index a foreign key automatically. Without one, each join
-- across the key falls back to a sequential scan, and every delete or update of
-- a referenced row has to scan the whole referencing table to enforce the
-- constraint. Supabase's performance advisor flagged 76 such keys here; the app
-- joins across many of them on its hottest pages (inventory lots -> GRN lines ->
-- PO lines, IRNs, job-work lines), and the rest still make cascading integrity
-- checks on profiles and lookup tables cheap.
--
-- All 76 are plain single-column btree indexes on the referencing column, which
-- is exactly what the constraint checks need. `if not exists` keeps this
-- re-runnable. The tables are small today, so build time and the added write
-- cost are both negligible.


-- approval_rights
create index if not exists idx_approval_rights_created_by
  on public.approval_rights (created_by);
create index if not exists idx_approval_rights_user_id
  on public.approval_rights (user_id);  -- joined by the app

-- audit_log
create index if not exists idx_audit_log_actor_id
  on public.audit_log (actor_id);

-- bom_lines
create index if not exists idx_bom_lines_created_by
  on public.bom_lines (created_by);
create index if not exists idx_bom_lines_project_line_item_id
  on public.bom_lines (project_line_item_id);  -- joined by the app

-- bom_template_lines
create index if not exists idx_bom_template_lines_created_by
  on public.bom_template_lines (created_by);

-- bom_templates
create index if not exists idx_bom_templates_created_by
  on public.bom_templates (created_by);

-- boms
create index if not exists idx_boms_approved_by
  on public.boms (approved_by);
create index if not exists idx_boms_created_by
  on public.boms (created_by);

-- categories
create index if not exists idx_categories_created_by
  on public.categories (created_by);
create index if not exists idx_categories_parent_id
  on public.categories (parent_id);  -- joined by the app

-- component_inspection_field_exclusions
create index if not exists idx_component_inspection_field_exclusions_created_by
  on public.component_inspection_field_exclusions (created_by);

-- components
create index if not exists idx_components_created_by
  on public.components (created_by);
create index if not exists idx_components_inspection_template_id
  on public.components (inspection_template_id);  -- joined by the app

-- customers
create index if not exists idx_customers_created_by
  on public.customers (created_by);

-- document_signatures
create index if not exists idx_document_signatures_user_id
  on public.document_signatures (user_id);  -- joined by the app

-- finished_goods
create index if not exists idx_finished_goods_created_by
  on public.finished_goods (created_by);
create index if not exists idx_finished_goods_product_id
  on public.finished_goods (product_id);  -- joined by the app

-- grn_lines
create index if not exists idx_grn_lines_created_by
  on public.grn_lines (created_by);
create index if not exists idx_grn_lines_jw_line_id
  on public.grn_lines (jw_line_id);  -- joined by the app
create index if not exists idx_grn_lines_project_id
  on public.grn_lines (project_id);  -- joined by the app
create index if not exists idx_grn_lines_target_lot_id
  on public.grn_lines (target_lot_id);  -- joined by the app

-- grns
create index if not exists idx_grns_created_by
  on public.grns (created_by);
create index if not exists idx_grns_received_by
  on public.grns (received_by);
create index if not exists idx_grns_vendor_id
  on public.grns (vendor_id);  -- joined by the app

-- inspection_template_fields
create index if not exists idx_inspection_template_fields_created_by
  on public.inspection_template_fields (created_by);

-- inspection_templates
create index if not exists idx_inspection_templates_created_by
  on public.inspection_templates (created_by);

-- inventory_lots
create index if not exists idx_inventory_lots_created_by
  on public.inventory_lots (created_by);
create index if not exists idx_inventory_lots_grn_line_id
  on public.inventory_lots (grn_line_id);  -- joined by the app
create index if not exists idx_inventory_lots_vendor_id
  on public.inventory_lots (vendor_id);  -- joined by the app

-- irn_answers
create index if not exists idx_irn_answers_created_by
  on public.irn_answers (created_by);
create index if not exists idx_irn_answers_field_id
  on public.irn_answers (field_id);  -- joined by the app

-- irns
create index if not exists idx_irns_approved_by
  on public.irns (approved_by);
create index if not exists idx_irns_created_by
  on public.irns (created_by);
create index if not exists idx_irns_jw_line_id
  on public.irns (jw_line_id);  -- joined by the app
create index if not exists idx_irns_po_line_id
  on public.irns (po_line_id);  -- joined by the app
create index if not exists idx_irns_project_id
  on public.irns (project_id);  -- joined by the app
create index if not exists idx_irns_supersedes_irn_id
  on public.irns (supersedes_irn_id);  -- joined by the app
create index if not exists idx_irns_target_lot_id
  on public.irns (target_lot_id);  -- joined by the app
create index if not exists idx_irns_template_id
  on public.irns (template_id);  -- joined by the app

-- job_work_lines
create index if not exists idx_job_work_lines_completed_lot_id
  on public.job_work_lines (completed_lot_id);  -- joined by the app
create index if not exists idx_job_work_lines_created_by
  on public.job_work_lines (created_by);
create index if not exists idx_job_work_lines_raw_lot_id
  on public.job_work_lines (raw_lot_id);  -- joined by the app

-- job_work_orders
create index if not exists idx_job_work_orders_created_by
  on public.job_work_orders (created_by);
create index if not exists idx_job_work_orders_root_jw_id
  on public.job_work_orders (root_jw_id);  -- joined by the app
create index if not exists idx_job_work_orders_superseded_by
  on public.job_work_orders (superseded_by);  -- joined by the app

-- notification_reads
create index if not exists idx_notification_reads_profile_id
  on public.notification_reads (profile_id);  -- joined by the app

-- notifications
create index if not exists idx_notifications_created_by
  on public.notifications (created_by);
create index if not exists idx_notifications_project_id
  on public.notifications (project_id);  -- joined by the app

-- po_lines
create index if not exists idx_po_lines_approved_by
  on public.po_lines (approved_by);  -- joined by the app
create index if not exists idx_po_lines_created_by
  on public.po_lines (created_by);
create index if not exists idx_po_lines_requisition_line_id
  on public.po_lines (requisition_line_id);  -- joined by the app

-- product_variant_params
create index if not exists idx_product_variant_params_created_by
  on public.product_variant_params (created_by);

-- products
create index if not exists idx_products_category_id
  on public.products (category_id);  -- joined by the app
create index if not exists idx_products_created_by
  on public.products (created_by);

-- profiles
create index if not exists idx_profiles_created_by
  on public.profiles (created_by);

-- project_activities
create index if not exists idx_project_activities_created_by
  on public.project_activities (created_by);

-- project_documents
create index if not exists idx_project_documents_approved_by
  on public.project_documents (approved_by);
create index if not exists idx_project_documents_created_by
  on public.project_documents (created_by);

-- project_line_items
create index if not exists idx_project_line_items_created_by
  on public.project_line_items (created_by);
create index if not exists idx_project_line_items_product_id
  on public.project_line_items (product_id);  -- joined by the app

-- projects
create index if not exists idx_projects_created_by
  on public.projects (created_by);

-- purchase_orders
create index if not exists idx_purchase_orders_created_by
  on public.purchase_orders (created_by);
create index if not exists idx_purchase_orders_superseded_by
  on public.purchase_orders (superseded_by);  -- joined by the app

-- requisition_lines
create index if not exists idx_requisition_lines_bom_line_id
  on public.requisition_lines (bom_line_id);  -- joined by the app
create index if not exists idx_requisition_lines_created_by
  on public.requisition_lines (created_by);

-- requisitions
create index if not exists idx_requisitions_created_by
  on public.requisitions (created_by);
create index if not exists idx_requisitions_requested_by
  on public.requisitions (requested_by);

-- site_purchases
create index if not exists idx_site_purchases_bom_line_id
  on public.site_purchases (bom_line_id);  -- joined by the app
create index if not exists idx_site_purchases_created_by
  on public.site_purchases (created_by);
create index if not exists idx_site_purchases_lot_id
  on public.site_purchases (lot_id);  -- joined by the app
create index if not exists idx_site_purchases_vendor_id
  on public.site_purchases (vendor_id);  -- joined by the app

-- stock_movements
create index if not exists idx_stock_movements_created_by
  on public.stock_movements (created_by);
create index if not exists idx_stock_movements_performed_by
  on public.stock_movements (performed_by);

-- vendor_components
create index if not exists idx_vendor_components_created_by
  on public.vendor_components (created_by);

-- vendors
create index if not exists idx_vendors_created_by
  on public.vendors (created_by);
