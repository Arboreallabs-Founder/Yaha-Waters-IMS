/**
 * Imports the 3 real Triton BOMs from Context/Product Master List.xls into
 * components + bom_templates + bom_template_lines.
 *   npx tsx src/lib/import/import-bom.ts
 *
 * The file is NOT the annotated "yellow" version, so every line is imported as
 * common (is_common=true, is_variant_driven=false). Variant rules are applied
 * later when Sudhir provides the annotated template.
 */
import { adminClient, CONTEXT_DIR, PRODUCT_MASTER_FILE } from "./_client";
import * as path from "node:path";
import * as XLSX from "xlsx";

const SHEET_TO_SKU: Record<string, string> = {
  "Triton 12K": "TRITON-12K",
  "Triton 3.6K": "TRITON-3.6K",
  "Triton 7.2K": "TRITON-7.2K",
};
const HEADER_WORDS = new Set(["description", "position", "qty", "sl no", "slno", "triton 12k", "triton 3.6k", "triton 7.2k"]);

type ParsedLine = { desc: string; qty: number; group: string | null };

function isNum(v: unknown): boolean {
  return typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)));
}
function toNum(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

/** Parse one row: trailing numbers are [position?, qty]; description is the last text before them. */
function parseRow(cells: unknown[]): ParsedLine | null {
  const arr = cells.map((c) => (c == null ? null : typeof c === "number" ? c : String(c).trim()));
  while (arr.length && (arr[arr.length - 1] === null || arr[arr.length - 1] === "")) arr.pop();
  if (arr.length < 2) return null;

  let qi = arr.length - 1;
  if (!isNum(arr[qi])) return null; // last cell not numeric → header / non-data row
  const qty = toNum(arr[qi]);
  let descEnd = qi - 1;
  if (descEnd >= 0 && isNum(arr[descEnd])) descEnd--; // skip the position number
  if (descEnd < 0) return null;

  const desc = arr[descEnd];
  if (typeof desc !== "string" || desc === "" || HEADER_WORDS.has(desc.toLowerCase())) return null;
  const group = descEnd > 0 && typeof arr[0] === "string" && arr[0] !== desc ? (arr[0] as string) : null;
  return { desc, qty, group };
}

async function main() {
  const supa = adminClient();
  const wb = XLSX.readFile(path.join(CONTEXT_DIR, PRODUCT_MASTER_FILE), { cellDates: true });

  // 1) Parse every sheet.
  const perProduct: { sku: string; lines: ParsedLine[] }[] = [];
  for (const sheetName of wb.SheetNames) {
    const sku = SHEET_TO_SKU[sheetName];
    if (!sku) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: null });
    const lines = aoa.map(parseRow).filter((x): x is ParsedLine => x !== null);
    perProduct.push({ sku, lines });
    console.log(`  ${sheetName} → ${lines.length} BOM lines`);
  }

  // 2) Ensure components for every distinct description (match existing by name).
  const { data: existingComps } = await supa.from("components").select("id, name, component_no");
  const compByName = new Map<string, string>();
  let maxPml = 0;
  for (const c of existingComps ?? []) {
    compByName.set(String(c.name).toLowerCase(), c.id);
    const m = String(c.component_no ?? "").match(/^PML-(\d+)$/);
    if (m) maxPml = Math.max(maxPml, Number(m[1]));
  }
  const allDescs = [...new Set(perProduct.flatMap((p) => p.lines.map((l) => l.desc)))];
  const toAdd = allDescs
    .filter((d) => !compByName.has(d.toLowerCase()))
    .map((name) => ({ component_no: `PML-${String(++maxPml).padStart(4, "0")}`, name, uom: "Nos" }));
  if (toAdd.length) {
    const { data, error } = await supa.from("components").insert(toAdd).select("id, name");
    if (error) throw new Error(`components: ${error.message}`);
    for (const c of data ?? []) compByName.set(String(c.name).toLowerCase(), c.id);
  }
  console.log(`  components: ${toAdd.length} new, ${allDescs.length} referenced`);

  // 3) Per product: ensure active template, clear lines, insert real lines.
  let totalLines = 0;
  for (const { sku, lines } of perProduct) {
    const { data: product } = await supa.from("products").select("id").eq("sku_code", sku).single();
    if (!product) {
      console.warn(`  ! product ${sku} not found, skipping`);
      continue;
    }
    let { data: tpl } = await supa
      .from("bom_templates")
      .select("id")
      .eq("product_id", product.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!tpl) {
      const { data: created, error } = await supa
        .from("bom_templates")
        .insert({ product_id: product.id, version: 1, is_active: true })
        .select("id")
        .single();
      if (error) throw new Error(`template ${sku}: ${error.message}`);
      tpl = created;
    }
    await supa.from("bom_template_lines").delete().eq("bom_template_id", tpl.id);

    const rows = lines.map((l) => ({
      bom_template_id: tpl!.id,
      component_id: compByName.get(l.desc.toLowerCase()) ?? null,
      quantity: l.qty,
      is_common: true,
      is_variant_driven: false,
      note: l.group,
    }));
    const { error } = await supa.from("bom_template_lines").insert(rows);
    if (error) throw new Error(`template lines ${sku}: ${error.message}`);
    totalLines += rows.length;
    console.log(`  ${sku}: ${rows.length} template lines`);
  }

  console.log(`\n✅ Imported ${totalLines} BOM template lines across ${perProduct.length} products.`);
}

main().catch((e) => {
  console.error("import-bom failed:", e?.message ?? e);
  process.exit(1);
});
