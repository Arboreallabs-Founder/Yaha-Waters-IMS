import type { SupabaseClient } from "@supabase/supabase-js";
import { PO_STATUS_FILE } from "./_client";
import { readAOA, findHeaderRow, columnMap, norm, parseDate, parseNum } from "./_xlsx";

const SHEET = "Material Status";
const SERIALIZED_HINTS = ["screen", "panel", "gearbox", "motor", "controller", "control panel"];
const NON_PROJECT = new Set(["", "stock", "consumable", "consumables", "na", "n/a", "-"]);

type PoRow = {
  supplier: string;
  material: string;
  poNo: string;
  poDate: string | null;
  qty: number | null;
  uom: string | null;
  rate: number | null;
  poAmt: number | null;
  invoiceNo: string | null;
  invoiceStatus: string | null;
  project: string; // normalized project name ("" = stock/untagged)
};

export async function importPoStatus(supa: SupabaseClient) {
  const aoa = readAOA(PO_STATUS_FILE, SHEET);
  const headerIdx = findHeaderRow(aoa, ["Supplier Name", "Material Description", "PO Number"]);
  if (headerIdx === -1) throw new Error("Could not locate the header row in the Material Status sheet.");
  const col = columnMap(aoa[headerIdx]);

  const c = {
    supplier: col("Supplier Name"),
    material: col("Material Description"),
    poNo: col("PO Number"),
    poDate: col("PO Dt"),
    qty: col("Qty"),
    uom: col("UoM"),
    rate: col("Rate"),
    poAmt: col("PO Amt"),
    invoiceNo: col("Invoice No"),
    invoiceStatus: col("Invoice Status"),
    projectPo: col("Project Name as per PO"),
    projectInv: col("Project Name as per Invoice"),
  };

  const projectOf = (r: unknown[]) => {
    const raw =
      norm(c.projectPo >= 0 ? r[c.projectPo] : null) ||
      norm(c.projectInv >= 0 ? r[c.projectInv] : null);
    return NON_PROJECT.has(raw.toLowerCase()) ? "" : raw;
  };

  const rows: PoRow[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    const get = (idx: number) => (idx >= 0 ? r[idx] : null);
    const supplier = norm(get(c.supplier));
    const material = norm(get(c.material));
    if (!supplier && !material) continue;
    rows.push({
      supplier,
      material,
      poNo: norm(get(c.poNo)),
      poDate: parseDate(get(c.poDate)),
      qty: parseNum(get(c.qty)),
      uom: norm(get(c.uom)) || null,
      rate: parseNum(get(c.rate)),
      poAmt: parseNum(get(c.poAmt)),
      invoiceNo: norm(get(c.invoiceNo)) || null,
      invoiceStatus: norm(get(c.invoiceStatus)) || null,
      project: projectOf(r),
    });
  }
  console.log(`  parsed ${rows.length} data rows`);

  const vendorMap = await upsertByName(supa, "vendors", uniq(rows.map((r) => r.supplier)));
  const compMap = await upsertComponents(supa, rows);
  const projectMap = await upsertProjects(supa, uniq(rows.map((r) => r.project)));
  const { newPOs, newLines, skippedPhone } = await upsertPurchaseOrders(
    supa,
    rows,
    vendorMap,
    compMap,
    projectMap,
  );

  return {
    rows: rows.length,
    vendors: vendorMap.size,
    components: compMap.size,
    projects: projectMap.size,
    newPOs,
    newLines,
    skippedPhone,
  };
}

// ---------- helpers ----------
function uniq(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

async function upsertByName(supa: SupabaseClient, table: string, names: string[]) {
  const { data: existing } = await supa.from(table).select("id, name");
  const map = new Map<string, string>();
  for (const e of existing ?? []) map.set(String(e.name).toLowerCase(), e.id);
  const toAdd = names.filter((n) => !map.has(n.toLowerCase())).map((name) => ({ name }));
  if (toAdd.length) {
    const { data, error } = await supa.from(table).insert(toAdd).select("id, name");
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const e of data ?? []) map.set(String(e.name).toLowerCase(), e.id);
  }
  return map;
}

async function upsertComponents(supa: SupabaseClient, rows: PoRow[]) {
  const { data: existing } = await supa.from("components").select("id, name, component_no");
  const map = new Map<string, string>();
  let maxNo = 0;
  for (const e of existing ?? []) {
    map.set(String(e.name).toLowerCase(), e.id);
    const m = String(e.component_no ?? "").match(/^IMP-(\d+)$/);
    if (m) maxNo = Math.max(maxNo, Number(m[1]));
  }
  const uomByMaterial = new Map<string, string | null>();
  for (const r of rows) {
    if (r.material && !uomByMaterial.has(r.material.toLowerCase())) {
      uomByMaterial.set(r.material.toLowerCase(), r.uom);
    }
  }
  const toAdd = uniq(rows.map((r) => r.material))
    .filter((name) => !map.has(name.toLowerCase()))
    .map((name) => {
      const lower = name.toLowerCase();
      return {
        component_no: `IMP-${String(++maxNo).padStart(4, "0")}`,
        name,
        uom: uomByMaterial.get(lower) ?? null,
        is_serialized: SERIALIZED_HINTS.some((h) => lower.includes(h)),
      };
    });
  if (toAdd.length) {
    const { data, error } = await supa.from("components").insert(toAdd).select("id, name");
    if (error) throw new Error(`components: ${error.message}`);
    for (const e of data ?? []) map.set(String(e.name).toLowerCase(), e.id);
  }
  return map;
}

async function upsertProjects(supa: SupabaseClient, projectNames: string[]) {
  const { data: existing } = await supa.from("projects").select("id, project_no");
  const map = new Map<string, string>();
  for (const e of existing ?? []) map.set(String(e.project_no).toLowerCase(), e.id);

  const toAdd = projectNames
    .filter((n) => !map.has(n.toLowerCase()))
    .map((name) => ({ project_no: name, status: "procurement" as const }));
  if (toAdd.length) {
    const { data, error } = await supa.from("projects").insert(toAdd).select("id, project_no");
    if (error) throw new Error(`projects: ${error.message}`);
    for (const e of data ?? []) map.set(String(e.project_no).toLowerCase(), e.id);
  }
  return map;
}

async function upsertPurchaseOrders(
  supa: SupabaseClient,
  rows: PoRow[],
  vendorMap: Map<string, string>,
  compMap: Map<string, string>,
  projectMap: Map<string, string>,
) {
  const { data: existingPOs } = await supa.from("purchase_orders").select("id, po_no");
  const poMap = new Map<string, string>();
  for (const e of existingPOs ?? []) poMap.set(String(e.po_no), e.id);

  const withPo = rows.filter((r) => r.poNo);
  const skippedPhone = rows.length - withPo.length;

  const groups = new Map<string, PoRow[]>();
  for (const r of withPo) {
    if (!groups.has(r.poNo)) groups.set(r.poNo, []);
    groups.get(r.poNo)!.push(r);
  }

  const projectId = (name: string) => (name ? projectMap.get(name.toLowerCase()) ?? null : null);

  let newPOs = 0;
  let newLines = 0;
  for (const [poNo, group] of groups) {
    if (poMap.has(poNo)) continue;
    const first = group[0];
    const total = group.reduce((s, r) => s + (r.poAmt ?? 0), 0);
    const { data: po, error } = await supa
      .from("purchase_orders")
      .insert({
        po_no: poNo,
        vendor_id: first.supplier ? vendorMap.get(first.supplier.toLowerCase()) ?? null : null,
        po_date: first.poDate,
        status: "sent",
        source: "system",
        total_amount: total || null,
        invoice_no: first.invoiceNo,
        invoice_status: first.invoiceStatus,
      })
      .select("id")
      .single();
    if (error) {
      console.warn(`  ! PO ${poNo}: ${error.message}`);
      continue;
    }
    newPOs++;
    const lines = group.map((r) => ({
      po_id: po.id,
      component_id: r.material ? compMap.get(r.material.toLowerCase()) ?? null : null,
      project_id: projectId(r.project),
      qty_ordered: r.qty ?? 0,
      rate: r.rate,
      amount: r.poAmt,
    }));
    const { error: lErr } = await supa.from("po_lines").insert(lines);
    if (lErr) console.warn(`  ! PO ${poNo} lines: ${lErr.message}`);
    else newLines += lines.length;
  }

  return { newPOs, newLines, skippedPhone };
}
