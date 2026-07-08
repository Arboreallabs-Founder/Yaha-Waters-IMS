# Data Model — YAHA Waters IMS

Companion to [../PRD.md](../PRD.md). Target: Supabase Postgres.

**Conventions**
- All tables: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at timestamptz`, `created_by uuid references profiles(id)`.
- `snake_case` everywhere. Foreign keys named `<table_singular>_id`.
- **RLS enabled on every table.** On-hand quantities are **derived from `stock_movements`**, never stored as an authoritative editable field (lot caches are trigger-maintained).

---

## Enums

```
role            : admin | founder | team_lead | team_member
project_status  : planning | doc_approval | procurement | production | dispatched | closed | on_hold
doc_type        : qap | drawing | spec | other
doc_status      : pending | approved | rejected
bom_status      : draft | approved
bom_line_source : template | manual
req_status      : open | partially_ordered | ordered | closed
po_status       : draft | sent | partial | completed | cancelled
po_source       : system | phone
po_line_status  : pending | partial | received | cancelled
input_type      : dropdown | number | text
movement_type   : receipt | issue | adjustment | transfer | return
lot_status      : available | reserved | consumed
fg_status       : in_production | ready | dispatched
```

---

## 1. Auth / Org

### `teams`
| col | type | notes |
|---|---|---|
| name | text | unique |

### `profiles`
| col | type | notes |
|---|---|---|
| id | uuid | PK, references `auth.users(id)` |
| full_name | text | |
| role | role | |
| team_id | uuid | → teams |
| is_active | bool | default true |

Helper functions (security definer):
- `auth_role() returns role` — reads role for `auth.uid()`.
- `auth_team_id() returns uuid` — reads team for `auth.uid()`.

---

## 2. Masters

### `categories`
`name` (text), `description` (text), `parent_id` (uuid → categories, nullable). Product categories / category templates.

### `products` — SKU template (e.g. Triton 12K)
`sku_code` (text unique), `model_name` (text), `category_id` (→ categories), `description` (text), `is_serialized` (bool), `base_image` (text, storage path).

### `product_variant_params`
Defines the configurable parameters per product (the founder's "dropdowns").
`product_id` (→ products), `name` (text, e.g. "Inlet Size"), `input_type` (input_type), `options` (jsonb, for dropdown e.g. `[6,8,10,12]`), `min_value` (numeric), `max_value` (numeric, e.g. micron 100–3000), `uom` (text), `sort_order` (int).

### `components` — the "component numbers"
`component_no` (text unique), `name` (text), `description` (text), `uom` (text), `type` (text), `is_serialized` (bool), `reorder_level` (numeric), `standard_cost` (numeric).

### `bom_templates`
`product_id` (→ products), `version` (int), `is_active` (bool). One active template per product.

### `bom_template_lines`
`bom_template_id` (→ bom_templates), `component_id` (→ components), `quantity` (numeric), `is_common` (bool — the "yellow" shared lines), `is_variant_driven` (bool), `variant_rule` (jsonb).

`variant_rule` example — pick component & qty by a param value:
```json
{ "param": "Inlet Size", "map": { "6": { "component_no": "NOZ-6", "qty": 1 },
                                   "8": { "component_no": "NOZ-8", "qty": 1 } } }
```

### `vendors` — vendor onboarding
`name` (text), `gst_no` (text), `contact` (text), `address` (text), `avg_lead_time_days` (int), `rating` (numeric), `is_active` (bool).

### `vendor_components` — who supplies what (powers phone-order matching)
`vendor_id` (→ vendors), `component_id` (→ components), `vendor_part_code` (text), `price` (numeric), `lead_time_days` (int). Unique (vendor_id, component_id).

---

## 3. Orders / Projects

### `customers`
`name` (text), `contact` (text), `address` (text), `gst_no` (text).

### `projects`
`project_no` (text unique), `customer_id` (→ customers), `customer_po_number` (text), `customer_po_value` (numeric), `order_date` (date), `status` (project_status), `delivery_date` (date), `dispatch_date` (date), `team_id` (→ teams, for RLS scoping).

### `project_line_items`
`project_id` (→ projects), `product_id` (→ products), `variant_selections` (jsonb, e.g. `{"Inlet Size":8,"Micron":200}`), `quantity` (int).

---

## 4. Planning / Documents

### `project_documents`
`project_id` (→ projects), `doc_type` (doc_type), `file_path` (text, storage), `status` (doc_status), `approved_by` (→ profiles), `approved_at` (timestamptz).

---

## 5. BOM Instance

### `boms`
`project_id` (→ projects), `status` (bom_status), `approved_by` (→ profiles), `approved_at` (timestamptz).

### `bom_lines`
`bom_id` (→ boms), `project_line_item_id` (→ project_line_items), `component_id` (→ components), `required_qty` (numeric), `source` (bom_line_source), `note` (text).
`source = manual` captures lines added beyond the template.

---

## 6. Demand / Procurement

### `requisitions` — the "indent"
`req_no` (text unique), `project_id` (→ projects, **nullable** = stock), `status` (req_status), `requested_by` (→ profiles).

### `requisition_lines`
`requisition_id` (→ requisitions), `component_id` (→ components), `qty` (numeric), `bom_line_id` (→ bom_lines, nullable), `shortfall_qty` (numeric).

### `purchase_orders`
`po_no` (text unique), `vendor_id` (→ vendors), `po_date` (date), `status` (po_status), `is_informal` (bool), `source` (po_source), `total_amount` (numeric), `invoice_no` (text), `invoice_status` (text).

### `po_lines`
`po_id` (→ purchase_orders), `component_id` (→ components), `project_id` (→ projects, **nullable** — back-fillable), `requisition_line_id` (→ requisition_lines, nullable), `qty_ordered` (numeric), `rate` (numeric), `amount` (numeric), `qty_received` (numeric, trigger-maintained), `line_status` (po_line_status).

> A single project's shortfall may span multiple POs; a single PO may serve multiple projects (batching). Both are first-class.

---

## 7. Receipt / Inventory

### `grns` — goods receipt note (at gate)
`grn_no` (text unique), `vendor_id` (→ vendors, nullable), `challan_no` (text), `po_id` (→ purchase_orders, nullable), `received_by` (→ profiles), `received_at` (timestamptz).

### `grn_lines`
`grn_id` (→ grns), `component_id` (→ components), `qty_received` (numeric), `po_line_id` (→ po_lines, **nullable**), `project_id` (→ projects, nullable), `unit_cost` (numeric), `is_untagged` (bool — received on no PO).

### `inventory_lots`
`lot_code` (text unique — **QR payload**), `component_id` (→ components), `grn_line_id` (→ grn_lines), `vendor_id` (→ vendors, nullable), `project_id` (→ projects, nullable), `qty_on_hand` (numeric, trigger-maintained), `qty_initial` (numeric), `unit_cost` (numeric), `location` (text), `is_serialized` (bool), `status` (lot_status).

> **Sticker / partial-use rule (locked):** `lot_code` is immutable and the printed sticker shows **name + number + QR only, never a quantity**. Partial issues do not change or reprint the QR — they only insert `issue` rows in `stock_movements`, and `qty_on_hand` is recomputed from the ledger. The live remaining count is always obtained by scanning, never read off the paper.

### `stock_movements` — immutable ledger (source of truth for on-hand)
`lot_id` (→ inventory_lots), `component_id` (→ components), `movement_type` (movement_type), `qty` (numeric, **signed**: receipt/return +, issue −), `project_id` (→ projects, nullable — consumption tag), `reference_type` (text, e.g. 'grn'|'requisition'|'manual'|'transfer'), `reference_id` (uuid), `performed_by` (→ profiles), `performed_at` (timestamptz).

### `finished_goods`
`project_line_item_id` (→ project_line_items), `product_id` (→ products), `serial_no` (text unique — QR), `status` (fg_status), `variant_selections` (jsonb).

---

## 8. Scheduling

### `project_activities` — mirrors the "Recommended Excel Tracking Format"
`project_id` (→ projects), `activity` (text, e.g. Document Approval / Material Receive / Machining / Fabrication / Hydro / Blasting-Painting / Assembly / FAT / Dispatch), `responsibility` (text), `planned_date` (date), `actual_date` (date), `variance_days` (int, generated), `status` (text), `material_available` (bool, derived), `po_released` (bool, derived), `delay_reason` (text), `corrective_action` (text), `sort_order` (int).

---

## 9. Triggers & Derived Logic

- **`stock_movements` → `inventory_lots.qty_on_hand`**: after insert, recompute lot on-hand = sum(qty) for lot; flip lot `status` to `consumed` at 0.
- **GRN post**: insert creates `inventory_lots` + `receipt` movements; sets `grn_lines.is_untagged` when `po_line_id` is null.
- **`grn_lines` → `po_lines.qty_received` / `line_status`**: roll up matched receipts; auto-`received` when satisfied.
- **PO auto-complete**: when all `po_lines` received → `purchase_orders.status = completed`.
- **PO/GRN/requisition numbering**: generated server-side (Edge Function or sequence) to avoid collisions.

---

## 10. Derived Views (Action Center + KPIs)

| View | Purpose |
|---|---|
| `v_component_on_hand` | sum of available lot qty per component (and value). |
| `v_project_consumption` | issued qty × unit_cost per project (internal costing). |
| `v_bom_variance` | per project/component: required − ordered − received. |
| `v_untagged_receipts` | `grn_lines.is_untagged = true`, pending tagging. |
| `v_missing_po` | BOM shortfalls with no requisition/PO. |
| `v_stale_stock` | available lots older than N days; dispatched projects with unrecorded consumption. |
| `v_po_overdue` | open PO lines past committed/expected date. |
| `v_invoice_vs_po` | PO amount/qty vs invoice values mismatch. |
| `v_supplier_kpi` | per vendor: on-time %, avg lead time, price trend, quality. |

---

## 11. RLS Policy Pattern (per table)

- **admin / founder**: `auth_role() in ('admin','founder')` → full `select`; admin also full write; founder write limited to approvals.
- **team_lead**: rows where `team_id = auth_team_id()` (projects and their children via join) → select + write; full read of masters.
- **team_member**: same team scope, narrower writes (GRN, scan/consume, requisitions); read masters; **financial columns** (`rate`, `amount`, `unit_cost`, `standard_cost`, `price`, `customer_po_value`) excluded via a column-masked view (`v_*_safe`) used by the member UI.
- **Masters** (`categories`, `products`, `components`, `vendors`, templates): read for all authenticated; write for admin (+ team_lead where appropriate).
- **`stock_movements`**: insert-only for operational roles; no update/delete (immutability). Corrections are new `adjustment` movements.
