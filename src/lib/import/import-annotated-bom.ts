/**
 * Imports the annotated BOM format (e.g. Context/BOM Master/Triton 3600 BR.xlsx)
 * into products + categories + components (+ attributes, vendor tags, JW flags,
 * tracking mode) + a nested bom_template (tree of sections / sub-assemblies /
 * variant groups) + vendor_components.
 *
 *   npm run import:bom
 *
 * Idempotent: upserts masters by natural key and rebuilds the product's template.
 * Built generically — add another model sheet by extending SHEETS and re-running.
 */
import { adminClient, CONTEXT_DIR } from "./_client";
import * as path from "node:path";
import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---- config: one entry per annotated sheet to import -------------------------
const SHEETS = [
  {
    file: "BOM Master/Triton 3600 BR.xlsx",
    sku: "TRITON-3600-BR",
    modelName: "Triton 3600",
    modelType: "Brush",
    modelFilter: 3600, // only rows whose Model column == this (drops stray carryover)
    category: "Triton",
    cnoPrefix: "BR3600",
  },
];

// ---- column indices (0-based) in the annotated sheet ------------------------
const C = {
  lineId: 0, model: 1, type: 2, section: 3, srno: 4, level: 5, assembly: 6,
  origDesc: 7, component: 8, grade: 9, spec: 10, od: 11, id: 12, thk: 13,
  width: 14, length: 15, nominal: 16, variantOpt: 17, variantGroup: 18,
  variation: 19, qty: 20, uom: 21, byWeight: 22, weightUom: 23, cutFromPlate: 24,
  supplier: 25, jobWork: 26, jwVendor: 27, jwVendor2: 28,
} as const;

// ---- cell helpers -----------------------------------------------------------
const str = (v: unknown): string => (v == null ? "" : String(v).trim());
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const yes = (v: unknown): boolean => /^y(es)?$/i.test(str(v));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// ---- vendor fuzzy matching --------------------------------------------------
const STOP = new Set([
  "pvt", "private", "ltd", "limited", "llp", "co", "company", "works", "work",
  "industries", "industry", "enterprises", "enterprise", "corporation", "corp",
  "store", "stores", "and", "the", "india",
]);
function vendorTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(engg|eng|engineers|engineering)\b/g, "engineering")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function tokenEq(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false; // short tokens must match exactly
  if (a.startsWith(b) || b.startsWith(a)) return true;
  return lev(a, b) <= 1;
}
/** Every token of the shorter name has a fuzzy match in the longer name. */
function vendorMatch(excel: string[], existing: string[]): boolean {
  if (!excel.length || !existing.length) return false;
  const [short, long] = excel.length <= existing.length ? [excel, existing] : [existing, excel];
  return short.every((t) => long.some((u) => tokenEq(t, u)));
}

// ---- parsed row -------------------------------------------------------------
type Row = {
  section: string; srno: string; level: string; assembly: string;
  origDesc: string; component: string; grade: string; spec: string;
  od: number | null; id: number | null; thk: number | null; width: number | null;
  length: number | null; nominal: string; nominalNum: number | null;
  variantGroup: string; variation: string; qty: number; uom: string;
  byWeight: boolean; weightUom: string; cutFromPlate: boolean;
  supplier: string; isJw: boolean; jwVendor: string;
};

function parseRows(ws: XLSX.WorkSheet, modelFilter: number): Row[] {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const rows: Row[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r) continue;
    if (num(r[C.model]) !== modelFilter) continue; // drop stray carryover models
    const srno = str(r[C.srno]);
    const variantGroup = str(r[C.variantGroup]);
    if (!srno && !variantGroup) continue; // blank/decorative row
    const jwVendor = str(r[C.jwVendor]) || str(r[C.jwVendor2]);
    rows.push({
      section: str(r[C.section]), srno, level: str(r[C.level]).toLowerCase(),
      assembly: str(r[C.assembly]), origDesc: str(r[C.origDesc]),
      component: str(r[C.component]) || str(r[C.origDesc]),
      grade: str(r[C.grade]), spec: str(r[C.spec]),
      od: num(r[C.od]), id: num(r[C.id]), thk: num(r[C.thk]),
      width: num(r[C.width]), length: num(r[C.length]),
      nominal: str(r[C.nominal]), nominalNum: num(r[C.nominal]),
      variantGroup, variation: str(r[C.variation]),
      qty: num(r[C.qty]) ?? 1, uom: str(r[C.uom]),
      byWeight: yes(r[C.byWeight]), weightUom: str(r[C.weightUom]),
      cutFromPlate: yes(r[C.cutFromPlate]),
      supplier: str(r[C.supplier]), isJw: yes(r[C.jobWork]),
      jwVendor: jwVendor.split("/")[0].trim(), // first of alternates
    });
  }
  return rows;
}

// ---- classification helpers -------------------------------------------------
const isFlatSection = (name: string) => /remaining/i.test(name);
const sectionLetter = (srno: string) => (srno.match(/^[A-Za-z]+/)?.[0] ?? "").toUpperCase();
const isSectionHeader = (srno: string) => /^[A-Za-z]$/.test(srno);
const parentSrno = (srno: string): string | null => {
  if (srno.includes(".")) return srno.slice(0, srno.lastIndexOf("."));
  return null; // resolved to the section node by the caller
};

type QuantityType = "nos" | "length" | "area";
type TrackingMode = "item" | "box" | "bulk";

function quantityType(uom: string): QuantityType {
  if (/mtr|meter|metre/i.test(uom)) return "length";
  return "nos";
}
function trackingMode(r: Row, isAssembly: boolean): TrackingMode {
  if (isAssembly) return "item";
  const name = `${r.component} ${r.origDesc}`.toLowerCase();
  if (/mtr|meter|metre/i.test(r.uom)) return "bulk";
  if (/ltr|litre|liter/i.test(r.uom) || /paint|primer|thinner|hardener|\bmio\b|epoxy|zinc/.test(name)) return "bulk";
  if (r.byWeight || r.cutFromPlate) return "bulk";
  if (/nut|bolt|screw|washer|o-?ring|grub|coupling|nipple|connector|gasket|\bkey\b|strip|fastener|bush|barrel/.test(name)) return "box";
  return "item";
}

const sizeKey = (r: Row): string => {
  const n = r.nominalNum ?? num(r.variation);
  return n != null ? String(n) : (r.variation || r.spec);
};
const sizeLabel = (r: Row): string => {
  const k = sizeKey(r);
  return /^[0-9.]+$/.test(k) ? `${k}"` : k;
};

// ---- main -------------------------------------------------------------------
type CompRow = Record<string, unknown> & { component_no: string };

async function importSheet(supa: SupabaseClient, cfg: (typeof SHEETS)[number]) {
  console.log(`\n▶ ${cfg.file}`);
  const wb = XLSX.readFile(path.join(CONTEXT_DIR, cfg.file), { cellDates: true });
  const rows = parseRows(wb.Sheets[wb.SheetNames[0]], cfg.modelFilter);
  console.log(`  parsed ${rows.length} data rows (model ${cfg.modelFilter})`);

  // ---- 1. vendors: resolve Excel names -> vendor ids (match existing / create)
  const { data: existingVendors } = await supa.from("vendors").select("id, name");
  const existing = (existingVendors ?? []).map((v) => ({ id: v.id as string, name: v.name as string, toks: vendorTokens(v.name as string) }));
  const vendorCache = new Map<string, string>(); // excel name (lower) -> id
  async function resolveVendor(name: string): Promise<string | null> {
    const key = name.toLowerCase();
    if (!name) return null;
    if (vendorCache.has(key)) return vendorCache.get(key)!;
    const toks = vendorTokens(name);
    const hit = existing.find((e) => vendorMatch(toks, e.toks));
    if (hit) { vendorCache.set(key, hit.id); return hit.id; }
    const { data, error } = await supa.from("vendors").insert({ name }).select("id").single();
    if (error) throw new Error(`vendor "${name}": ${error.message}`);
    const id = data!.id as string;
    existing.push({ id, name, toks });
    vendorCache.set(key, id);
    console.log(`  + new vendor: ${name}`);
    return id;
  }
  const vendorNames = new Set<string>();
  for (const r of rows) { if (r.supplier) vendorNames.add(r.supplier); if (r.isJw && r.jwVendor) vendorNames.add(r.jwVendor); }
  for (const n of vendorNames) await resolveVendor(n);

  // ---- 2. product + category ------------------------------------------------
  let { data: cat } = await supa.from("categories").select("id").eq("name", cfg.category).maybeSingle();
  if (!cat) cat = (await supa.from("categories").insert({ name: cfg.category }).select("id").single()).data;
  const { data: product, error: pErr } = await supa
    .from("products")
    .upsert({ sku_code: cfg.sku, model_name: cfg.modelName, category_id: cat!.id, description: `${cfg.modelType} type`, is_serialized: true }, { onConflict: "sku_code" })
    .select("id").single();
  if (pErr) throw new Error(`product: ${pErr.message}`);
  const productId = product!.id as string;

  // ---- 3. build component set ----------------------------------------------
  // group variant rows; find the anchor (the row that carries a Sr. No.)
  const groups = new Map<string, Row[]>();
  for (const r of rows) if (r.variantGroup) (groups.get(r.variantGroup) ?? groups.set(r.variantGroup, []).get(r.variantGroup)!).push(r);
  const anchorSrnoOf = new Map<string, string>();
  for (const [g, rs] of groups) anchorSrnoOf.set(g, (rs.find((r) => r.srno) ?? rs[0]).srno);

  const comps: CompRow[] = [];
  const seen = new Set<string>();
  const pushComp = (c: CompRow) => { if (!seen.has(c.component_no)) { seen.add(c.component_no); comps.push(c); } };

  const attrs = (r: Row, isAssembly: boolean, rawSupplierId: string | null, jwVendorId: string | null) => ({
    grade: r.grade || null, spec: r.spec || null,
    od_mm: r.od, id_mm: r.id, thk_mm: r.thk, width_mm: r.width, length_mm: r.length,
    nominal_size: r.nominal || null, by_weight: r.byWeight, weight_uom: r.weightUom || null,
    cut_from_plate: r.cutFromPlate, original_description: r.origDesc || null,
    uom: r.uom || "Nos", quantity_type: quantityType(r.uom), tracking_mode: trackingMode(r, isAssembly),
    is_assembly: isAssembly, is_job_work: r.isJw, jw_vendor_id: jwVendorId,
    raw_supplier_id: rawSupplierId,
  });

  // component_no per row/variant
  const cnoOf = (srno: string) => `${cfg.cnoPrefix}-${srno.replace(/\./g, "-")}`.toUpperCase();
  const variantCnoOf = (anchorSrno: string, r: Row) => `${cfg.cnoPrefix}-${anchorSrno.replace(/\./g, "-")}-${slug(sizeKey(r)).toUpperCase() || "V"}`.toUpperCase();

  // 3a. synth section-assembly nodes for non-flat sections without a header row
  const sections = [...new Set(rows.map((r) => r.section).filter(Boolean))];
  const sectionNodeCno = new Map<string, string>();     // section -> component_no
  const sectionHeaderRow = new Map<string, Row>();      // section -> real header row (if any)
  for (const sec of sections) {
    if (isFlatSection(sec)) continue;
    const secRows = rows.filter((r) => r.section === sec);
    const header = secRows.find((r) => isSectionHeader(r.srno));
    if (header) {
      sectionHeaderRow.set(sec, header);
      sectionNodeCno.set(sec, cnoOf(header.srno));
    } else {
      const cno = `${cfg.cnoPrefix}-${slug(sec).toUpperCase()}`;
      sectionNodeCno.set(sec, cno);
      pushComp({ component_no: cno, name: sec, is_assembly: true, is_job_work: false, by_weight: false, cut_from_plate: false, tracking_mode: "item", quantity_type: "nos", uom: "Nos" });
    }
  }

  // 3b. one component per row (variant rows -> sized components)
  for (const r of rows) {
    const rawSupplierId = r.supplier ? vendorCache.get(r.supplier.toLowerCase()) ?? null : null;
    const jwVendorId = r.isJw && r.jwVendor ? vendorCache.get(r.jwVendor.toLowerCase()) ?? null : null;
    const isAssembly = r.level === "assembly" || isSectionHeader(r.srno);
    if (r.variantGroup) {
      const anchor = anchorSrnoOf.get(r.variantGroup)!;
      pushComp({ component_no: variantCnoOf(anchor, r), name: `${r.component} ${sizeLabel(r)}`.trim(), ...attrs(r, false, rawSupplierId, jwVendorId) });
    } else {
      pushComp({ component_no: cnoOf(r.srno), name: r.component, ...attrs(r, isAssembly, isAssembly ? null : rawSupplierId, jwVendorId) });
    }
  }

  const { error: cErr } = await supa.from("components").upsert(comps, { onConflict: "component_no" });
  if (cErr) throw new Error(`components: ${cErr.message}`);
  const { data: compIds } = await supa.from("components").select("id, component_no").in("component_no", comps.map((c) => c.component_no));
  const compIdByNo = new Map((compIds ?? []).map((c) => [String(c.component_no), c.id as string]));
  console.log(`  components: ${comps.length} (${comps.filter((c) => c.is_assembly).length} assemblies, ${comps.filter((c) => c.is_job_work).length} job-work)`);

  // ---- 4. bom_templates: product template + one per sub-assembly ------------
  // Build line specs; each carries the key of its parent node (assembly or top-level).
  type LineSpec = {
    key: string; parentKey: string | null; component_no: string | null;
    quantity: number; line_type: string; section: string; assembly_name: string | null;
    is_variant_driven: boolean; variant_rule: unknown; variant_group: string | null;
    variation: string | null; sort_order: number;
  };
  const specs: LineSpec[] = [];
  let order = 0;

  // 4a. section-assembly nodes (top-level lines)
  for (const sec of sections) {
    if (isFlatSection(sec)) continue;
    const header = sectionHeaderRow.get(sec);
    const cno = sectionNodeCno.get(sec)!;
    const key = header ? header.srno : `SEC:${sec}`;
    specs.push({ key, parentKey: null, component_no: cno, quantity: header?.qty ?? 1, line_type: "assembly", section: sec, assembly_name: sec, is_variant_driven: false, variant_rule: null, variant_group: null, variation: null, sort_order: order++ });
  }

  const doneGroups = new Set<string>();
  for (const r of rows) {
    if (isSectionHeader(r.srno)) continue; // already added as a node above
    const flat = isFlatSection(r.section);

    // variant group -> single variant-driven line at the anchor
    if (r.variantGroup) {
      if (doneGroups.has(r.variantGroup)) continue;
      doneGroups.add(r.variantGroup);
      const grpRows = groups.get(r.variantGroup)!;
      const anchor = grpRows.find((x) => x.srno) ?? grpRows[0];
      const map: Record<string, { component_no: string; qty: number }> = {};
      for (const gr of grpRows) map[sizeKey(gr)] = { component_no: variantCnoOf(anchor.srno, gr), qty: gr.qty };
      const parentKey = flat ? null : (parentSrno(anchor.srno) ?? `SECNODE:${anchor.section}`);
      specs.push({ key: anchor.srno, parentKey, component_no: null, quantity: anchor.qty, line_type: "component", section: anchor.section, assembly_name: anchor.assembly || null, is_variant_driven: true, variant_rule: { param: "Inlet Size", map }, variant_group: r.variantGroup, variation: anchor.variation || null, sort_order: order++ });
      continue;
    }

    const parentKey = flat ? null : (parentSrno(r.srno) ?? `SECNODE:${r.section}`);
    specs.push({ key: r.srno, parentKey, component_no: cnoOf(r.srno), quantity: r.qty, line_type: r.level === "assembly" ? "assembly" : "component", section: r.section, assembly_name: r.assembly || null, is_variant_driven: false, variant_rule: null, variant_group: null, variation: null, sort_order: order++ });
  }

  // resolve SECNODE:<section> parent keys to the section header/synth key
  const sectionKeyOf = (sec: string) => (sectionHeaderRow.get(sec)?.srno ?? `SEC:${sec}`);
  for (const s of specs) if (s.parentKey?.startsWith("SECNODE:")) s.parentKey = sectionKeyOf(s.parentKey.slice("SECNODE:".length));

  // Each assembly node owns its own template; its children live there.
  const assemblyCnoByKey = new Map<string, string>();
  for (const s of specs) if (s.line_type === "assembly" && s.component_no) assemblyCnoByKey.set(s.key, s.component_no);

  async function getTemplate(owner: { product_id?: string; component_id?: string }): Promise<string> {
    const sel = supa.from("bom_templates").select("id").eq("is_active", true);
    const { data } = owner.product_id
      ? await sel.eq("product_id", owner.product_id).maybeSingle()
      : await sel.eq("component_id", owner.component_id!).maybeSingle();
    if (data) return data.id as string;
    const { data: created, error } = await supa
      .from("bom_templates").insert({ ...owner, version: 1, is_active: true }).select("id").single();
    if (error) throw new Error(`template: ${error.message}`);
    return created!.id as string;
  }

  const productTemplateId = await getTemplate({ product_id: productId });
  const templateIdByCno = new Map<string, string>();
  for (const cno of new Set(assemblyCnoByKey.values())) {
    const cid = compIdByNo.get(cno);
    if (cid) templateIdByCno.set(cno, await getTemplate({ component_id: cid }));
  }

  // clear existing lines for every owner template, then insert flat (one level each)
  const allTemplateIds = [productTemplateId, ...templateIdByCno.values()];
  await supa.from("bom_template_lines").delete().in("bom_template_id", allTemplateIds);

  const ownerTemplateOf = (parentKey: string | null): string => {
    if (!parentKey) return productTemplateId;
    const cno = assemblyCnoByKey.get(parentKey);
    return cno ? templateIdByCno.get(cno)! : productTemplateId;
  };
  const insertRows = specs.map((s) => ({
    bom_template_id: ownerTemplateOf(s.parentKey),
    component_id: s.component_no ? compIdByNo.get(s.component_no) ?? null : null,
    quantity: s.quantity, is_common: !s.is_variant_driven, is_variant_driven: s.is_variant_driven,
    variant_rule: s.variant_rule, line_type: s.line_type, section: s.section,
    assembly_name: s.assembly_name, variant_group: s.variant_group, variation: s.variation,
    sort_order: s.sort_order, note: s.assembly_name,
  }));
  const { error: lErr } = await supa.from("bom_template_lines").insert(insertRows);
  if (lErr) throw new Error(`template lines: ${lErr.message}`);
  console.log(`  templates: 1 product + ${templateIdByCno.size} sub-assembly; ${specs.length} lines (${specs.filter((s) => s.line_type === "assembly").length} sub-assembly refs, ${specs.filter((s) => s.is_variant_driven).length} variant-driven)`);

  // 4b. tag each component with its parent sub-assembly (drives the components-master dropdown)
  const specByKey = new Map(specs.map((s) => [s.key, s]));
  const parentAssemblyOf = new Map<string, string>(); // component_no -> parent assembly component_no
  for (const s of specs) {
    const parentCno = s.parentKey ? specByKey.get(s.parentKey)?.component_no : null;
    if (!parentCno) continue;
    if (s.component_no) parentAssemblyOf.set(s.component_no, parentCno);
    if (s.is_variant_driven) {
      const map = (s.variant_rule as { map?: Record<string, { component_no?: string }> } | null)?.map ?? {};
      for (const v of Object.values(map)) if (v?.component_no) parentAssemblyOf.set(v.component_no, parentCno);
    }
  }
  for (const [cno, pcno] of parentAssemblyOf) {
    const cid = compIdByNo.get(cno);
    const pid = compIdByNo.get(pcno);
    if (cid && pid) await supa.from("components").update({ parent_assembly_id: pid }).eq("id", cid);
  }
  console.log(`  parent sub-assembly tags: ${parentAssemblyOf.size}`);

  // ---- 5. variant params ----------------------------------------------------
  const inletOptions = [...new Set(rows.filter((r) => r.variantGroup).map((r) => sizeKey(r)).filter((k) => /^[0-9.]+$/.test(k)).map(Number))].sort((a, b) => a - b);
  const vparams = [
    { product_id: productId, name: "Inlet Size", input_type: "dropdown", options: inletOptions, uom: "in", sort_order: 0 },
    { product_id: productId, name: "Micron", input_type: "dropdown", options: [120, 130, 150, 200, 300, 500], uom: "µm", sort_order: 1 },
  ];
  const { error: vErr } = await supa.from("product_variant_params").upsert(vparams, { onConflict: "product_id,name" });
  if (vErr) throw new Error(`variant params: ${vErr.message}`);
  console.log(`  variant params: Inlet Size [${inletOptions.join(", ")}], Micron`);

  // ---- 6. vendor_components (raw supplier per component) --------------------
  const vc: { vendor_id: string; component_id: string }[] = [];
  const vcSeen = new Set<string>();
  for (const c of comps) {
    const vid = c.raw_supplier_id as string | null;
    const cid = compIdByNo.get(c.component_no);
    if (!vid || !cid) continue;
    const k = `${vid}:${cid}`;
    if (vcSeen.has(k)) continue;
    vcSeen.add(k);
    vc.push({ vendor_id: vid, component_id: cid });
  }
  if (vc.length) {
    const { error: vcErr } = await supa.from("vendor_components").upsert(vc, { onConflict: "vendor_id,component_id" });
    if (vcErr) throw new Error(`vendor_components: ${vcErr.message}`);
  }
  console.log(`  vendor_components: ${vc.length} component→supplier tags`);
}

async function main() {
  const supa = adminClient();
  for (const cfg of SHEETS) await importSheet(supa, cfg);
  console.log("\n✅ Annotated BOM import complete.\n");
}

main().catch((e) => {
  console.error("\nimport-annotated-bom failed:", e?.message ?? e, "\n");
  process.exit(1);
});
