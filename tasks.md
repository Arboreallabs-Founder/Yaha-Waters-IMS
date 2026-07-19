# YAHA Waters IMS — Build Tracker

Live status of the build. See [PRD.md](PRD.md), [docs/data-model.md](docs/data-model.md), and the
approved plan. Legend: `[ ]` todo · `[x]` done · `[!]` blocked/needs input.

## ✅ M1 — Foundations: DELIVERED & VERIFIED

### How to run locally
```bash
npm install
npm run dev            # http://localhost:3000
```
Sign in with the seeded **test admin** (already created in the DB):
- **admin@yahawaters.com** / **YahaWaters@2026**  *(change after first sign-in)*

To provision the real first admin and import Excel data, add the **service-role key** to
`.env.local` (`SUPABASE_SERVICE_ROLE_KEY=`), then:
```bash
npm run seed:admin     # creates sidajayb@gmail.com admin (or SEED_ADMIN_EMAIL)
npm run import          # vendors, components, customers, projects, historical POs
node supabase/dump-migrations.mjs   # mirror applied migrations into supabase/migrations/
```

### Phase A — Database (project `jbqjwyluurlvmgpvzksw`)
- [x] 0001 extensions, enums, `set_updated_at`, teams/profiles, `auth_role`/`auth_team_id`/`auth_is_staff`
- [x] 0002–0007 masters, orders/projects, BOM instance, procurement, receipt/inventory, scheduling
- [x] 0008 triggers + numbering (on-hand recompute, GRN→lots/movements, PO rollup/auto-complete, doc numbers)
- [x] 0009 views (Action-Center + KPI views + `v_*_safe` column-masked views, all `security_invoker`)
- [x] 0010 RLS policies (all 26 tables) + grants
- [x] 0011 fixed customers RLS + locked trigger fns out of RPC
- [x] 0012 `admin_list_users()` (admin-only, joins auth email)
- [x] advisors: **security clean** (only the 4 required auth-helper warnings remain)
- [x] TS types generated → `src/lib/database.types.ts`
- [x] migrations mirrored into `supabase/migrations/*.sql` (13 files) + 0013 `dump_migrations()` RPC

### Phase B — App scaffold + auth
- [x] Next.js 15 (App Router, TS) + Tailwind v4 + shadcn-style UI + PWA (manifest, SW, installable)
- [x] `@supabase/ssr` clients + middleware auth gate (`/` → `/login` when signed out — verified 307)
- [x] `/login` (email+password, no signup) — verified 200 + live sign-in works

### Phase C — Admin user management
- [x] Edge Function `admin-create-user` (deployed, ACTIVE; service-role, admin-gated)
- [x] `/admin/users` — create users, edit role/team/active, manage teams
- [x] real first admin seeded — **sidajayb@gmail.com** / YahaWaters@2026

### Phase D — Masters CRUD
- [x] Categories, Components, Vendors (+vendor_components), Products (+variant params), BOM Templates (+lines)
- [x] generic config-driven `CrudManager`; financial columns hidden for team_member via safe views
- [x] catalogue seeded: 2 categories, **8 products** (Triton 3.6K/7.2K/12K/48K + PR/SLMB/BR/SLM), **24 variant params**

### Phase E — Real-data import (`src/lib/import/`, SheetJS + service-role) — DONE
- [x] **PO Status workbook:** 47 vendors · 452 components · 55 projects · 136 POs · 595 PO lines (all project-tagged)
- [x] project tag derived from "Project Name as per PO raised" (GVPR, JSPL Angul, IHP, Hydro Flow…)
- [x] **Product Master List.xls:** 3 real Triton BOMs imported (`npm run import:bom`) →
  TRITON-12K (64), TRITON-3.6K (54), TRITON-7.2K (63) = **181 template lines**, 111 new components.
- [x] removed 5 doc-only placeholder products (Triton 48K, PR, SLMB, BR, SLM — no source data).
- [x] idempotent (safe to re-run `npm run import` / `npm run import:bom`)
- [!] BOM lines imported all as **common** — the annotated "yellow" file (common vs variant-driven)
  is still needed to wire up the inlet/outlet/micron variant rules.

> Products now: TRITON-12K / 3.6K / 7.2K (real BOMs) + any you add in the app (e.g. `SAMA`).

### Verification (M1) — all green
- [x] `next build` passes (11 routes)
- [x] auth sign-in works (live token); anon blocked by RLS (0 rows)
- [x] **team_member scoped to own team** (sees 0 of another team's projects); admin sees all
- [x] `v_components_safe` hides `standard_cost`; team_member master-write → **403**
- [x] catalogue products/variant params queried back correctly

---

## Known follow-ups
- [x] ~~`SUPABASE_SERVICE_ROLE_KEY`~~ — provided; admin seeded, data imported, migrations mirrored.
- [!] Annotated BOM templates from Sudhir → enables BOM-template line import + variant→BOM (M2).
- Re-enable the **typed** Supabase client: generated types currently make postgrest-js v2 collapse
  write/result types to `never`, so app query clients run untyped (`src/lib/supabase/*`). Schema
  safety is enforced by migrations; revisit when the types/lib interplay is pinned down.
- Replace the SVG PWA icon with proper 192/512 PNGs.

## ✅ M2 — BOM & Templates: DELIVERED
- [x] **Projects / Orders** (`/projects`) — create/edit projects (customer, team, status, dates).
- [x] **Project detail** (`/projects/[id]`) — line-item editor with **dynamic variant inputs** built
  from each product's `product_variant_params` (Inlet/Outlet dropdowns, Micron number).
- [x] **Variant→BOM engine** (`src/lib/bom-engine.ts`, pure + unit-verified) — expands the active
  template × line-item qty, resolves variant-driven lines via `variant_rule`.
- [x] **BOM instance + approval** — Generate/Regenerate, manual line add, Approve/Unapprove (locks editing).
- [x] **Verified** (`npx tsx src/lib/import/verify-bom.ts`): Triton 12K @ 8"/200µm ×2 →
  BOLT-T ×8, GASKET-T ×4, **NOZ-8 ×2** (variant), no 6" nozzle. ✅ PASS
- Demo fixtures live: product `TRITON-12K` has a test BOM template; project `BOM-TEST-12K` shows the
  engine working. (Replace with real annotated templates when available.)

## ✅ M3 — Procurement & Stock-check: DELIVERED
- [x] `v_project_shortfall` view (0014): per project/component `required − ordered − on-hand` (clamped ≥0).
- [x] **Project page → Stock check & shortfall** section + "Raise requisition / Raise PO for shortfall".
- [x] **Requisitions** (`/requisitions`): list, create (project or stock, auto `REQ/26-27/NNNN`), detail
  with line editor + status, **convert → PO**, raise-from-shortfall.
- [x] **Purchase Orders** (`/purchase-orders`): list, create incl. **phone/informal** capture
  (auto `PO/26-27/NNNN`), detail with line editor, **per-line project-tag back-fill**, vendor
  suggestion (from `vendor_components`), PO total auto-summed; financial cols hidden for team_member.
- [x] **Untagged PO-line worklist** on `/purchase-orders` — lists lines ordered with no project and
  lets you tag them inline (cross-PO back-fill; the "Rakesh-proof" capture).
- [x] Verified: shortfall math (required 10 − ordered 6 − on-hand 0 = 4); **signed-in admin write path
  under RLS** (numbering RPCs + insert project/PO/po_line/requisition + project-tag back-fill, all OK);
  build green (18 routes); advisors clean (only benign auth-helper warns + an Auth "leaked-password" tip).

## ✅ M4 — GRN + Inventory + QR: DELIVERED
- [x] Migration 0015 `next_fg_no()`; deps: `qrcode` (runtime) + `@zxing/browser` (camera fallback).
- [x] **GRN** (`/grn`): receive against a PO (open lines pre-listed) **or** untagged capture; `grn_no`
  via `next_grn_no()`. Posting a line auto-creates the lot + receipt movement + rolls up/auto-completes
  the PO (triggers). Posted lines immutable. "Print stickers" link.
- [x] **Inventory**: on-hand by component (`/inventory`), lots list (`/inventory/lots`), lot detail
  (`/inventory/lots/[id]`) with QR, immutable ledger, and Consume/Stock-take/Transfer actions.
- [x] **QR**: `QrCode` component (`qrcode.toDataURL`); sticker print page (`/inventory/stickers`) —
  name + number + QR only, **no quantity** (locked spec); shell hidden in print.
- [x] **Scan** (`/scan`): camera (`BarcodeDetector` + `@zxing/browser` fallback) + manual lot-code
  entry → resolve lot → **scan-to-consume into project**, stock-take, transfer; re-reads live qty.
- [x] **Finished goods** (`/finished-goods`): create unit + serial (`next_fg_no()`) + QR + status.
- [x] **Verified end-to-end (signed-in admin, live triggers):** receive 6 → lot on-hand 6 + receipt
  movement + PO line 6/partial; untagged (3) → `is_untagged` + in `v_untagged_receipts`; consume 2 →
  lot 6→4 + `v_project_consumption`=2; receive remaining 4 → PO line received + PO auto-completed.
  Build green (26 routes); advisors clean (benign auth-helper warns + leaked-password tip).
- Note: camera needs a secure context (works on localhost; production needs HTTPS) — manual entry covers the rest.

## ✅ M5 — Reconciliation & Dashboards: DELIVERED
- [x] Migration 0016: `v_project_costing` (ordered/received/consumed per project) + enhanced
  `v_supplier_kpi` with real `on_time_lines`/`late_lines` (latest GRN receipt vs `expected_date`).
- [x] **Action Center** (`/reconciliation`): 6 checks with count cards + drill-down tables — BOM
  variance, untagged receipts (inline **tag-to-project**), missing PO, stale stock, PO overdue,
  invoice≠PO. Tagging clears `is_untagged`.
- [x] **Supplier KPIs** (`/suppliers`): scorecard — POs, fulfilment %, **on-time %**, lead time, rating.
- [x] **Leadership dashboard** (home `/`): live stock value, active projects, open/overdue POs,
  untagged count, Action-Center summary, project-costing table (finance-gated).
- [x] **Project costing card** on `/projects/[id]` (customer PO vs ordered vs received vs consumed).
- [x] Verified (signed-in admin, live views): costing ordered 1250 / received 1000 / consumed 200;
  late receipt → `late_lines`=1, on-time 0; overdue line surfaced; invoice diff 250; untagged→tag
  clears worklist (DB + REST). Build green (26 routes); advisors clean.

## ✅ M6 — Production Scheduling: DELIVERED
- [x] Migration 0017: `v_project_schedule` (total/completed/overdue activities, next planned, derived
  `po_released` + `material_ready`) and `v_overdue_activities`.
- [x] **Per-project Production Schedule** (on `/projects/[id]`): activities table (planned/actual/
  **auto variance**, status, delay reason + corrective action), add/edit/remove, **seed the 9-step
  standard sequence**, and a **material-readiness banner** (POs released / material ready, with a
  "confirm material before fabrication" warning).
- [x] **Schedule overview** (`/schedule`): per-project progress + overdue + readiness badges,
  **overdue-activities** list, and **dispatchable-this-month** (invoicing focus).
- [x] Dashboard: **Overdue activities** stat; nav: **Production Schedule** live.
- [x] Verified (signed-in admin, live views): variance auto-computes (+9); `v_overdue_activities`
  lists only the past-due, not-done activity; `v_project_schedule` counts correct; `po_released`
  flips on PO; `material_ready` = false on genuine shortfall, true when covered. Build green
  (27 routes); advisors clean.

## 🎉 Full PRD roadmap (M1–M6) complete.

## ✅ M7 — BOM / Component Overhaul (annotated format): DELIVERED
Re-modelled masters around the real annotated BOM (`Context/BOM Master/Triton 3600 BR.xlsx`).
- [x] **Schema (0018–0022)**: component attributes (grade/spec/OD/ID/thk/width/length/nominal/by-weight/
  cut-from-plate/original-desc) + `is_assembly` + Job-Work (`is_job_work`, `raw_supplier_id`, `jw_vendor_id`,
  `jw_rate`) + `tracking_mode` enum (`item`/`box`/`bulk`); `bom_template_lines` tree (`parent_line_id`,
  `line_type`, `section`, `assembly_name`, `variant_group/variation`, `sort_order`); lot `jw_stage`
  (`raw`/`completed`) + `parent_lot_id` + `container_no`, `grn_lines.target_lot_id`; **tracking-mode-aware
  GRN lot trigger** (item→N QR lots, box→one box lot or add-to-existing, bulk→one measured lot);
  `job_work_orders`/`job_work_lines` + `next_jw_no()` + `dispatch_job_work`/`receive_job_work` RPCs
  (cost = raw + JW, QR lineage via `parent_lot_id`); `v_components_safe` re-masks `jw_rate`; hardened
  write RPCs off `anon`. All mirrored to `supabase/migrations/`.
- [x] **Wiped** old masters (582 components, 3 products/templates, 181 lines, 1 category, 993 stale seed
  lots). **Kept** the 47 vendors.
- [x] **Importer** (`src/lib/import/import-annotated-bom.ts`, `npm run import:bom`) — generic annotated-BOM
  parser (add more model sheets to `SHEETS[]`). Imported **Triton 3600 BR**: 1 product, 79 components
  (3 stockable sub-assemblies: Housing / SS Brush Frame / Drive Housing; 10 job-work), nested template
  tree (70 lines, 3 variant-driven by Inlet Size 2/3/4/6"), Inlet Size + Micron params, 76 vendor tags
  (fuzzy-matched to existing vendors; 3 new: A D Engineers, Metal Craft Engineers, Om Sai Fabicoats).
- [x] **Masters UI**: components form (attributes, assembly, tracking-mode, job-work group); BOM template
  editor renders the **section/sub-assembly tree** (indented, nest-under picker); product page unchanged.
- [x] **Job Work** route (`/job-work`): create order → add lines (JW component + raw lot) → Dispatch →
  Receive (rolls completed lot cost = raw + JW). "Raw stock awaiting job work" panel. Consuming a raw
  JW lot is blocked (must finish first).
- [x] **Lot / QR rework**: GRN receiver honours `tracking_mode` (item = one QR per piece; box = new box or
  add-to-existing box; bulk = measured `piece_*`); lot detail shows stage/box/raw-lineage + add-to-box.
- [x] **Verified**: import asserts (tree resolves, 0 orphan/variant-rule refs, JW vendors tagged);
  live JW round-trip (raw 100 + JW 30 → 5 item-tracked completed lots @ ₹130, raw drawn to 0, order
  received) then cleaned up; `next build` green (33 routes); advisors clean (only benign auth-RPC +
  leaked-password warns); `verify:bom` PASS.

## Changelog
- 2026-12-11 — **Critical security patch: Next.js 15.1.3 → 15.5.20.** Vercel's first production
  build flagged CVE-2025-66478 (React2Shell, CVSS 10.0, actively-exploited RCE in the RSC protocol) —
  patched to 15.1.11 first (the fix for the 15.1.x line), then, per explicit go-ahead, upgraded further
  to 15.5.20 (Vercel's official 15.x "backport" release tag) to also close ~20 other historical
  Next.js CVEs (image-optimization content injection, middleware bypass/SSRF, cache poisoning, DoS,
  CSP-nonce XSS, etc.) that `npm audit` still showed at 15.1.11 — all resolved by 15.5.20 while
  staying on major version 15 (no Next 16 jump). Verified: `npm run typecheck` clean at both stops;
  fresh `next dev` on 15.5.20 starts cleanly and a broad route sample (login, dashboard, inventory,
  requisitions, GRN, purchase-orders, masters, job-work, projects) compiles/responds correctly.
  Remaining `npm audit` items are unrelated to this app's exposed surface: a `postcss` copy nested
  inside Next's own build tooling (not runtime-exposed), and a pre-existing `xlsx` prototype-pollution/
  ReDoS issue with no upstream fix (only reachable via manually-run import scripts, never an HTTP
  route). **Not yet done:** rotate Supabase secrets if the app was live-and-unpatched before this fix
  (Next's advisory explicitly recommends this) — flagged to the user, not something I can action myself.
- 2026-07-20 — **Mobile compatibility pass**, scoped to warehouse-floor flows (Scan-consume, GRN
  receiving, Inventory, Requisitions) per explicit decision — back-office pages (Masters, BOM
  templates, PO editor, Reconciliation, Project detail) were left untouched (verified they already
  don't break on mobile, just aren't specially optimized). Investigated first via two Explore agents:
  found the nav drawer/PWA/viewport/QR-scanner foundation already solid; confirmed two real gaps
  (SVG-only PWA icons, 36px icon-only buttons below the ~44px touch guideline) and fixed both.
  - **PWA icons**: generated real 192/512/apple-touch-icon PNGs from `public/yaha-logo.png` via macOS
    `sips`; wired into `manifest.json` + `layout.tsx` metadata.
  - **Safe areas**: `viewportFit: "cover"` + `env(safe-area-inset-*)` padding on the sticky header,
    main content, and mobile drawer top bar (`app-shell.tsx`) for notched phones.
  - **Touch targets**: `Button`'s `icon` size variant bumped from `h-9 w-9` (36px) to `size-11 sm:size-9`
    (44px mobile / 36px desktop) — one change, propagates to every icon button app-wide; also bumped
    the raw hamburger/close buttons in the drawer to match.
  - **New shared primitive** `src/components/ui/mobile-row-card.tsx` — a `Card`-based row shell
    (title/subtitle/badge/fields/actions) used as the `sm:hidden` companion to a `hidden sm:block`
    `<Table>`, so wide tables read as a stacked card list on phones instead of horizontal-scrolling.
    Pattern: wrap the whole `<Table>` (not just its className — `Table`'s wrapper div is hardcoded and
    doesn't take a passthrough class) in an outer `hidden sm:block` div.
  - Applied to: `inventory/page.tsx` (on-hand list), `inventory/[id]/page.tsx` (Open/Issued/Consumption
    tables + un-collapsed the `grid-cols-3` summary cards to `grid-cols-1 sm:grid-cols-3`),
    `inventory/lots/[id]/page.tsx` (ledger), `grn/[id]/grn-receiver.tsx` (both tables),
    `requisitions/page.tsx` (list), `requisitions/[id]/requisition-editor.tsx` (lines).
  - Fixed a cramped fixed-width input row in `scan-consume.tsx` (qty/reason/button squeezed
    side-by-side) — now stacks full-width below `sm:` via `flex-col sm:flex-row`.
  - No changes to `Table`/`Dialog`/`CrudManager` primitives or any out-of-scope page.
  - Verified: `npm run typecheck` clean after every file; every touched route (`/inventory`,
    `/inventory/[id]`, `/inventory/lots/[id]`, `/requisitions`, `/requisitions/[id]`, `/grn`)
    compiles cleanly under `next dev` with no errors; manifest + all 3 new PNG icons serve 200 (no
    404s). Not visually checked on a real device — recommend an actual phone/DevTools-emulation pass
    before considering this "done done".
- 2026-07-20 — **GRN manual-entry component picker now narrows to the vendor.** When a GRN has a
  vendor (`grns.vendor_id`), the "Component" dropdown in the manual/extra-line entry form now shows
  only components tagged to that vendor via `vendor_components` — not the full component list.
  A small checkbox ("Showing only X's components — check to show all") lets the receiver override
  this for anything not yet tagged, so it's never a dead end. No filter applied to untagged GRNs or
  vendors with zero tagged components (falls back to showing everything). Verified against real data
  (e.g. Nirav Tubes & Valves → 18 tagged components); route recompiles clean.
- 2026-07-20 — **Removed PO invoice tracking** (`invoice_no`/`invoice_status`) entirely, per request.
  Migration 0029: dropped `v_invoice_vs_po` (the "Invoice ≠ PO" reconciliation check it powered) and
  the two columns from `purchase_orders`; `v_purchase_orders_safe` (a dependent, unused column-masked
  view) recreated without them. Removed from: PO editor header form, PO list column, PO detail page,
  `updatePO` action, the Action Center's "Invoice ≠ PO" card + section, the Dashboard's matching stat,
  and the historical PO-status importer's invoice parsing/insert. `database.types.ts` regenerated.
  Typecheck clean; full-repo grep confirms zero remaining references outside historical migration files.
- 2026-07-17 — **Purchase Order printing**, matching the company's real historical PO template
  (`Context/PO Template/YAHA PO.pdf` + logo). New `/purchase-orders/[id]/print` page — logo, "YAHA
  water systems pvt. ltd." header + tagline, PO date/no./project, vendor vs. billing address blocks,
  line-items table (component/qty/UOM/rate/amount), GSTIN/PAN, subtotal/GST/total, the standard
  6-point terms & conditions, delivery address, delivery/payment/freight terms, and a 3-way
  Prepared/Verified/Approved signature block (Prepared-by auto-fills the current user; the other two
  are blank for physical sign-off). "Print PO" button added to the PO detail page.
  - Migration 0028: `purchase_orders.delivery_terms` / `payment_terms` / `freight_terms` / `gst_percent`
    (defaults match the template: Urgent / 30 Days / At Actual / 18%), editable in the PO editor header.
  - Our company's billing/delivery address, GSTIN, PAN, and contact person are hardcoded from the real
    template (not configurable yet — would need a settings table if this should vary).
  - **Data gap surfaced, not fixed:** every vendor's `address`/`contact`/`gst_no` is empty (never
    imported) — the Vendors master already has editable fields for these (no code needed), but they
    need to be filled in per-vendor for the printed PO's "VENDOR NAME & ADDRESS" block to be complete.
    The print page shows a "(no address on file)" placeholder when blank rather than failing.
  - Logo copied to `public/yaha-logo.png`. Verified: route compiles clean under `next dev`, correct
    auth redirect when signed out; not visually checked in a live authenticated browser session.
- 2026-07-16 — **"Block stock for BOM"**: reserving inventory against an approved BOM, closing the gap
  left by removing manual requisition-line entry. New **"Stock status & blocking"** section on the
  project page (between BOM and Materials Issued) — per required component: Blocked (mine) / Available
  (open) / Issued to another project (with which project + qty) / Out of stock, plus a **"Block stock
  for BOM"** button (enabled once the BOM is approved). Clicking it creates a requisition, seeds its
  lines from the approved `bom_lines` (aggregated by component), and reserves whatever's currently
  on-hand. **`issue_requisition` RPC rewritten (0027)**: now best-effort/partial (blocks what it can,
  reports the rest as short, instead of rolling back the whole transaction on any shortfall) and
  re-runnable (nets off what's already reserved); also fixed a latent bug where it could silently grab
  an `open` lot already earmarked for a *different* project via that project's own PO — now only
  untagged or same-project open stock is reservable. Freeing stock blocked for another project is via
  the existing `/inventory/[id]` "Issued inventory" section (Unissue button, admin/team_lead) — no new
  code needed there, it already existed. Verified live: partial coverage, no double-reservation on
  re-run, and the "don't steal another project's stock" fix, all against real data; then reverted the
  test blocking so the demo project is untouched for manual testing.
- 2026-07-16 — Removed the manual "Component / Qty / Add" form from the requisition detail page
  (`requisition-editor.tsx`) and its now-unused `addReqLine` server action. **Requisitions can no
  longer have lines added manually** — the only surviving line-adding path (`raiseRequisitionFromShortfall`)
  is also dead code (not wired into any button). A requisition's line table is now display/remove-only;
  new requisitions are created empty and have no way to gain lines until a line-adding flow is wired
  up. Flagging this — likely needs a follow-up (e.g. wire up raise-from-shortfall, or a BOM-driven picker).
- 2026-07-16 — **"Raise PO for shortfall" now raises one PO per supplier**, not one lump PO.
  `raisePoFromShortfall` (`purchase-orders/actions.ts`) groups shortfall lines by each component's
  `raw_supplier_id` and creates a separate `purchase_orders` row (with that vendor set) per group —
  components with no supplier tagged fall into one "no supplier tagged" PO. Single-supplier shortfalls
  keep the old UX (redirect straight to that PO); multi-supplier shortfalls stay on the project page
  and list a link to each PO raised (`shortfall-panel.tsx`). Verified the grouping against real
  vendor-tagged components (4 components → 4 distinct real suppliers → 4 correct groups). Note:
  `convertRequisitionToPO` has the same single-vendor limitation but is dead code (not wired into any
  UI) — removed (dead code, no callers).
- 2026-07-16 — Project page: added a read-only **"Materials issued"** panel (`issued-panel.tsx`)
  between BOM and Stock-check/shortfall — planned qty (from `bom_lines`) vs actually issued qty
  (from `v_project_consumption`, i.e. real `stock_movements` issue records), for every component
  either planned or issued. Anything issued that isn't in the BOM (e.g. scanned in as an extra, or a
  sub-assembly's own part issued directly) is flagged "Not in plan" rather than hidden. Verified live
  on `DEMO-SHORTFALL` (planned+issued Housing → "Fully issued"; issued MS Circle, which only exists in
  Drive Housing's own sub-template, not this project's flat BOM → "Unplanned"), then cleaned up.
- 2026-07-16 — Scan moved into Requisitions; issuing removed from the project page. Deleted the
  standalone `/scan` nav item + route; scanning now lives inside a requisition (`scan-consume.tsx`,
  reusable `QrScanner` camera/manual component) and always consumes for *that* requisition's project.
  Stock (no-project) requisitions can still scan-consume but are **admin-only** and require a **reason**
  (`stock_movements.note`, migration 0026) — `consumeLot` enforces both server-side, not just in the UI.
  Removed the per-row "Issue" button + `quickIssueComponent` from the project Stock-check/shortfall
  panel — issuing/consuming now only happens via Requisitions ("Issue from stock" bulk-FIFO or the new
  scan-consume). "Raise PO for shortfall" stays on the project page (procurement, not issuing).
- 2026-07-15 — Sub-assembly BOM templates + smart shortfall. `bom_templates` can now belong to a
  product OR a sub-assembly component (0024); importer routes each sub-assembly's parts into its own
  template; product template references them. BOM template editor shows sub-BOM parts as inline
  collapsible dropdowns (read-only, pulled recursively) + "open sub-BOM" drill-down; components master
  has a "Sub-assembly" parent dropdown (0023). **Smart recursive shortfall (0025):** `project_shortfall()`
  fn + redefined `v_project_shortfall` — consumes a stocked sub-assembly, else explodes its BOM into
  component shortfalls recursively, resolving variants per line item. Verified on demo project
  `DEMO-SHORTFALL` (both branches). Demo project left in place for viewing.
- 2026-07-14 — M7 BOM/component overhaul: annotated-BOM schema (0018–0022), masters wiped & re-imported
  from `Triton 3600 BR.xlsx` (tree/sub-assemblies, attributes, vendor tags, Job Work, tracking modes),
  new `/job-work` workflow, lot/QR rework. Vendors preserved. Build green; JW round-trip verified.
- 2026-06-25 — M1 foundations delivered: full DB + RLS + triggers + views, auth, admin user mgmt,
  Masters CRUD, import scripts. Build green; auth/RLS verified end-to-end. Catalogue seeded.
- 2026-06-25 — M2 delivered (Projects/Orders, variant→BOM engine, approval). Real Triton BOMs
  imported from Product Master List.xls (181 lines); 5 placeholder products removed.
- 2026-06-25 — Per user request, cleared all transactional seed data: projects (55+demo), POs (136),
  PO lines (595). Masters kept (vendors, components, 3 Triton products + real BOMs). `npm run import`
  would re-seed projects/POs if re-run.
- 2026-06-25 — BOM line editor reworked: removed the "common" checkbox (common = not variant-driven)
  and replaced raw-JSON variant rules with a dropdown builder.
- 2026-06-25 — Deleted test variant params (gamma, pannera) on Triton 12K. PROVISIONAL first pass
  (`npx tsx src/lib/import/propose-variant-lines.ts`): flagged 3 inlet-size-driven lines each on
  TRITON-12K & 7.2K (flange/pad/pipe), created VAR-* sized components. 3.6K skipped (nozzle ~3",
  seeded 6–12 options likely wrong). All flagged lines noted "confirm with Sudhir" — supersede with
  the annotated "yellow" file.
