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

## Changelog
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
