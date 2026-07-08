# PRD — YAHA Waters Inventory Management System (IMS)

**Company:** YAHA Water Systems Pvt. Ltd. (YWSPL)
**Document owner:** sidajayb@gmail.com
**Date:** 2026-06-24
**Status:** Approved for build
**Stack:** Next.js (App Router, TS) + Supabase (Postgres, Auth, Storage, Edge Functions), PWA

> Companion document: [docs/data-model.md](docs/data-model.md) — full table-by-table schema, enums, views and RLS policies.

---

## 1. Context

**YAHA Water Systems Pvt. Ltd. (YWSPL)** manufactures industrial water-filtration systems — the **Triton** series of automatic self-cleaning filters (3.6K / 7.2K / 12K / 48K) plus media-filter families (PR, SLMB, BR, SLM). Each model is a configurable product: variants differ mainly by **inlet/outlet nozzle size** (2"–16") and **screen micron rating** (100–3000 µm), with one or two more parameters. Every model has a ~60–70 line **BOM**, of which ~10 lines vary by variant and ~60 are common.

Today the business runs on **Excel** (`PO Status` sheet, `Project Schedule` sheet, `Product Master List`). The fields they already track tell us the domain: *Supplier, Material Description, PO Number, PO Date, Qty, UoM, Rate, PO Amount, Material Status, Invoice No, Invoice Status, Project Name (per Invoice) and Project Name (per PO)*. POs are **batched across 3–5 projects**; some receipts are tagged `Stock` or `Consumable` with no project.

**The core problem (from the founder):** everything funnels through one person, **Rakesh**. He:
- raises POs late, orders **by phone with no PO**, and often **doesn't tag the project**;
- **delays updating Excel** for goods receipts and for stock **consumption**.

Result: real stock is unknown (₹20–50 lakh shows on paper but actual is lower), project costing is wrong (finished goods don't move out of stock), and the company is held hostage to one person's memory. The founder's explicit goal: a system that is **independent of any single person** and that **captures reality even when the formal process is bypassed**, while staying **simple to use**.

**Intended outcome:** an IMS where (a) anyone can configure a Triton/media variant and auto-generate its BOM, POs and requisitions; (b) goods receipt and consumption are recorded at the point of action via **QR scanning** by the person doing the work (not Rakesh); (c) un-PO'd / phone-ordered material is still captured at the gate; and (d) leadership sees true live stock, project consumption value, procurement status, and a production schedule — all behind role-based access with Supabase RLS.

---

## 2. Goals & Non-Goals

**Goals**
- Single source of truth for SKUs, components, BOMs, vendors, projects, POs, receipts, inventory and consumption.
- "Rakesh-proof": correct inventory even when POs are informal/untagged; consumption recorded by scanning, not by one person's back-filling.
- Configure-a-variant → auto-expand BOM → compute shortfall vs stock → suggest POs/requisitions.
- QR-based goods receipt and consumption (hybrid: serialized units + bulk lots).
- Multi-level reconciliation: BOM vs Ordered vs Received variance, untagged-receipt capture, missing-PO and stale-stock alerts, invoice-vs-PO cross-check.
- Production scheduling (planned vs actual) linked to procurement status; supplier-performance KPIs; internal project-costing dashboards.
- Proper login (no public signup), role-based access, Postgres RLS on every table.
- Easy to use on phone (PWA) for gate/shop-floor staff.

**Non-Goals (explicitly out of scope)**
- **No external integrations** — no Tally / accounting sync, no ERP, no e-invoicing. Costing/value reporting is **internal only**.
- No customer-facing portal, no payments, no public signup.
- No automated supplier emailing/EDI (POs may stay informal; system records them).

---

## 3. Users, Roles & Access (RBAC + RLS)

Auth: **Supabase Auth, email + password, admin-provisioned only** (no signup screen). Admin creates users via an admin screen backed by a Supabase Edge Function using the service-role key.

| Role | Who | Capability |
|---|---|---|
| **Admin** | IT / system owner | Everything incl. user management, masters, templates, RLS-sensitive data, all financials. |
| **Founder** | Sudhir / management | Full **read** of all data + dashboards/costing; can approve; same data visibility as Admin (no user-management). |
| **Team Lead** | Prem (planning), accounts lead | Manage assigned projects end-to-end: planning, BOM approve, raise PO, post GRN, view rates/amounts, schedule. |
| **Team Member** | Rakesh, Sanoj, Akshay, store/gate staff | Operational tasks on assigned projects: scan receipts/consumption, GRN entry, raise requisitions, read masters. **Pricing/amount fields hidden** by role. |

- Every table has RLS. Helper SQL functions `auth_role()` and `auth_team_id()` read from `profiles`.
- Pattern: admin/founder → full select; team_lead → rows for their team's projects + all masters; team_member → assigned-project rows + read masters, financial columns gated via column-level views.
- **Separation of duties is the anti-bottleneck mechanism:** receiving (Sanoj) is decoupled from PO-raising (Rakesh) is decoupled from planning (Prem). Inventory becomes correct as a *side effect* of each person doing their own step.

---

## 4. Module Overview

1. **Auth & User Management** — login, admin-provisioned users, roles.
2. **Master Data** — Categories, Product/SKU templates + variant parameters, Component/Part master, BOM templates, Vendor master + vendor↔component mapping.
3. **Customers, Orders & Projects** — customer orders, project numbers, line items (SKU + variant + qty).
4. **Document Approval / Planning** — QAP / drawings / specs upload + approval gate.
5. **BOM Engine** — instantiate template by variant selection, expand by qty, allow manual line adds.
6. **Stock-Check & Shortfall** — BOM required vs live on-hand → shortfall.
7. **Requisitions (Indent)** — tracked demand, project-tagged or stock.
8. **Procurement / Purchase Orders** — per-vendor POs, multi-project batching, per-component lines, informal/phone-order flag, project tag back-fillable.
9. **Goods Receipt (GRN)** at gate — match vs PO, challan capture, **untagged-item capture**, auto-complete POs, QR sticker generation.
10. **Inventory & Stock Ledger** — lots, on-hand, locations, movements (receipt/issue/adjust/transfer/return), finished goods.
11. **QR System** — generate, print stickers, scan-to-receive, scan-to-consume, scan-to-transfer, stock-take.
12. **Reconciliation & Checks** — BOM/Ordered/Received variance, untagged receipts, missing PO, stale stock, invoice-vs-PO.
13. **Production Scheduling** — activities, planned vs actual, variance, linked to material/PO status.
14. **Supplier Performance KPIs** — on-time %, lead time, price trend, scorecard.
15. **Dashboards & Reporting** — live stock value, project consumption/costing, procurement status, schedule adherence.

---

## 5. Data Model (summary)

Full detail in [docs/data-model.md](docs/data-model.md). Conventions: `snake_case`; every table has `id uuid pk`, `created_at`, `updated_at`, `created_by`; RLS enabled on all tables.

**Auth/Org:** `profiles`, `teams`
**Masters:** `categories`, `products`, `product_variant_params`, `components`, `bom_templates`, `bom_template_lines`, `vendors`, `vendor_components`
**Orders/Projects:** `customers`, `projects`, `project_line_items`
**Planning/Docs:** `project_documents`
**BOM instance:** `boms`, `bom_lines`
**Demand/Procurement:** `requisitions`, `requisition_lines`, `purchase_orders`, `po_lines`
**Receipt/Inventory:** `grns`, `grn_lines`, `inventory_lots`, `stock_movements`, `finished_goods`
**Scheduling:** `project_activities` (+ derived supplier-KPI views)

Key design choices that make the system "Rakesh-proof":
- `po_lines.project_id` is **nullable** → solves "no project tag"; back-fillable later.
- `grn_lines.is_untagged` and `grn_lines.po_line_id` nullable → material received with **no PO** (phone/forgotten orders) is still recorded in inventory.
- On-hand is **derived from the immutable `stock_movements` ledger** — never a hand-edited number.

**Seed data:** import models & component lists from `Product Master List.xls`, vendors & historical POs from the `PO Status` sheet, projects/activities from `Project Schedule`, and product families from the catalogue PDF.

---

## 6. QR System (Hybrid)

- **Payload:** opaque `lot_code` (and `serial_no` for finished goods) → resolves to lot/component server-side. Library: `qrcode` for generation; browser `BarcodeDetector` / `@zxing/browser` for camera scanning in the PWA.
- **Granularity (hybrid):**
  - **Serialized** (main filter units, high-value components like screens, control panels, gearboxes): 1 lot = 1 unit, qty 1, unique QR per piece.
  - **Bulk/consumable** (bolts, gaskets, sand, media by kg/m): 1 lot = 1 received batch with a quantity; QR identifies the lot, qty is entered on scan.
- **Sticker design (locked):** the sticker prints **only the component name + number and the QR** — **no quantity is printed**. The QR is a permanent ID for the lot; the live remaining quantity lives in the system and is always read by **scanning**, never trusted from the paper. This avoids a printed number going stale after partial use. Printed **at time of receipt/collection** and stuck on the item/batch.
- **Partial consumption (locked):** taking part of a lot does **not** change or reprint the QR. Scanning the same sticker and issuing a quantity writes an `issue` movement and decrements `inventory_lots.qty_on_hand`; the next scan shows the updated remaining count. Example: scan a 200-bolt lot, issue 100 → ledger records −100, lot now shows 100 remaining, **same sticker stays on the box.**
- **Scan actions:** Receive (confirm GRN) · **Consume → pick project + enter qty** (decrements lot, writes `issue` movement — this is what makes stock/costing self-correct) · Transfer location · Stock-take/audit.
- **Enforcement:** material is "consumed into a project" only by scanning, so the on-hand and per-project consumption value update automatically — removing the dependence on Rakesh's manual Excel updates.

---

## 7. Reconciliation & Multi-Level Checks (the heart of the system)

1. **BOM vs Ordered vs Received variance** — per project/component: `required (BOM) − ordered (PO) − received (GRN)`. Surfaces "screens arrived but BOM needs 4 keys → −4", and "20 consumed of 20 ordered → order 1 more shows as available."
2. **Untagged receipts** — `grn_lines.is_untagged = true`: material received with no PO (phone/forgotten orders). Still added to inventory; listed in a worklist to **tag to a PO/project later**.
3. **Missing PO / un-procured shortfall** — BOM shortfalls with no requisition or PO raised.
4. **Stale stock** — lots `available` beyond N days; project dispatched but consumption not recorded.
5. **PO open/overdue** — committed vs actual delivery (feeds supplier scorecard).
6. **Invoice vs PO cross-check** — PO amount/qty vs invoice amount/qty (the existing double-check), with `invoice_status`.
7. **Auto-complete** — when GRN lines satisfy PO lines, line→`received` and PO→`completed`; remainder stays open.

These run as Postgres views + a dashboard "Action Center" with counts per check, so discrepancies are visible to leadership without asking Rakesh.

---

## 8. Key End-to-End Workflow

1. **Order in** → create `project` + `project_line_items` (pick Triton model, choose variant params from dropdowns/inputs, qty).
2. **Document approval** → upload QAP/drawing/spec, approve (soft gate before BOM-approve).
3. **BOM generated** → engine instantiates template by variant + qty; planner reviews, adds manual lines, approves.
4. **Stock check** → shortfall computed vs live on-hand; in-stock lines reserved, shortfall → requisition.
5. **Procurement** → raise PO(s) per vendor (batch across projects); or log an **informal/phone PO**; project tag optional & back-fillable. Each component can sit on a different PO.
6. **Goods receipt** → Sanoj at gate matches challan vs PO, posts GRN; **unmatched items captured as untagged**; inventory lots created; **QR stickers printed & applied**.
7. **Consumption** → shop floor **scans QR to consume into a project**; on-hand and project cost auto-update.
8. **Finished goods** → completed unit gets a serial QR; status ready→dispatched (linked to schedule).
9. **Reconciliation & dashboards** → Action Center + KPIs + schedule run continuously off the ledger.

---

## 9. Tech Stack & Architecture

- **Frontend:** **Next.js** (App Router, TypeScript), Tailwind + shadcn/ui, **PWA** (installable, camera scanning, offline-tolerant capture for gate). React Query for data, `@supabase/ssr` for auth.
- **Backend:** **Supabase** — Postgres (+ RLS), Auth, Storage (documents, QR/sticker assets), Edge Functions for privileged ops (user provisioning, PO/GRN number generation, bulk seed import).
- **Derived data:** Postgres views + a few triggers (stock-movement → lot on-hand; GRN post → lots + movements; PO line received → status). On-hand is always derivable from `stock_movements` (auditable).
- **Libraries:** `qrcode` (gen), `@zxing/browser`/`BarcodeDetector` (scan), `xlsx` (seed import + Excel-style export to preserve current reports).
- **Repo:** Next.js app + `supabase/` (migrations, functions, seed). Env via `.env.local`.

---

## 10. Security

- No public signup; sign-in only. Admin provisions users (Edge Function, service-role).
- RLS on every table; role + team scoping via `profiles`. Financial columns (rate/amount/cost) gated from team_member via column-masked views.
- Storage buckets private with signed URLs.
- Audit: `created_by`/`performed_by` + immutable `stock_movements` ledger.

---

## 11. Build Phasing (delivery milestones)

- **M1 Foundations:** Supabase schema + RLS, auth/login, user management, masters (categories, products+variant params, components, vendors).
- **M2 BOM & Templates:** BOM templates, variant engine, project/order entry, BOM instance + approval.
- **M3 Procurement & Stock-check:** shortfall, requisitions, POs (incl. informal), project-tag back-fill.
- **M4 GRN, Inventory & QR:** GRN + untagged capture, lots + ledger, QR generation/printing, scan-to-consume. **(Pilot here on Triton series, per founder.)**
- **M5 Reconciliation & Dashboards:** all checks/Action Center, supplier KPIs, internal costing dashboards.
- **M6 Production Scheduling:** activities, planned-vs-actual, material/PO linkage.

---

## 12. Open Questions / Future

- Exact extra variant parameters beyond inlet/outlet size + micron (confirm with Sudhir's annotated BOM templates).
- Whether team_member should see any pricing at all (assumed: no).
- Barcode hardware vs phone camera at gate (assumed: phone PWA; hardware scanners can be added as keyboard-wedge later).
- Future (post-PRD): Tally/ERP export, supplier email/EDI, customer portal.

---

## 13. Verification (how we validate the build)

- **Schema/RLS:** apply migrations to a Supabase branch; verify each role (admin sees all; team_member blocked from other teams' projects and from price columns); run advisors for RLS/security lints.
- **Variant→BOM:** configure Triton 12K @ 8"/200µm ×2 → assert BOM lines = common + variant-driven, quantities ×2.
- **Procurement→GRN→inventory:** raise PO, post GRN with one matched + one **untagged** line → assert inventory lots created, untagged appears in Action Center, on-hand correct from ledger.
- **QR consume:** generate QR, scan-to-consume into a project → assert lot decrement, `issue` movement, project consumption value updates.
- **Reconciliation:** force BOM>ordered and ordered>received cases → assert variance numbers; back-fill a project tag on a PO line → assert it propagates.
- **End-to-end pilot:** run one real Triton project order→dispatch on seeded data; confirm leadership dashboard shows true stock & project cost with no manual Excel step.
