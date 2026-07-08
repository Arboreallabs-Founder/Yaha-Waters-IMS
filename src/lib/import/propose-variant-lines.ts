/**
 * PROVISIONAL first-pass: flags the obvious inlet-size-driven BOM lines as
 * variant-driven and wires them to "Inlet Size", creating sized component
 * variants as needed. Marked "confirm with Sudhir" — replace once the annotated
 * file arrives.
 *   npx tsx src/lib/import/propose-variant-lines.ts
 *
 * Also deletes the test variant params (gamma, pannera) from Triton 12K.
 */
import { adminClient } from "./_client";

const NOTE = "auto-flagged variant — confirm with Sudhir";

// Per product: nominal nozzle size + the inlet/outlet parts that scale with it.
const CONFIG = [
  { sku: "TRITON-12K", nominal: 10, param: "Inlet Size", options: [6, 8, 10, 12],
    lines: ["MS PIPE 10INCH C CLASS", "MS FLANGE10INCH", "MS PAD 10INCH"] },
  { sku: "TRITON-7.2K", nominal: 6, param: "Inlet Size", options: [6, 8, 10, 12],
    lines: ["MS PIPE 6INCH C CLASS", "MS FLANGE 6INCH", "MS PAD 6INCH"] },
];

async function main() {
  const supa = adminClient();

  // ---- #1: delete the test params on Triton 12K ----
  const { data: t12 } = await supa.from("products").select("id").eq("sku_code", "TRITON-12K").single();
  if (t12) {
    const { data: del } = await supa
      .from("product_variant_params")
      .delete()
      .eq("product_id", t12.id)
      .in("name", ["gamma", "pannera"])
      .select("name");
    console.log(`Deleted test params: ${(del ?? []).map((d) => d.name).join(", ") || "(none)"}`);
  }

  // ---- component cache + creator ----
  const { data: comps } = await supa.from("components").select("id, name, component_no");
  const byName = new Map((comps ?? []).map((c) => [c.name.toLowerCase(), { id: c.id, no: c.component_no }]));
  let maxVar = 0;
  for (const c of comps ?? []) {
    const m = String(c.component_no).match(/^VAR-(\d+)$/);
    if (m) maxVar = Math.max(maxVar, Number(m[1]));
  }
  async function ensureComponent(name: string): Promise<string> {
    const hit = byName.get(name.toLowerCase());
    if (hit) return hit.no;
    const component_no = `VAR-${String(++maxVar).padStart(4, "0")}`;
    const { error } = await supa.from("components").insert({ component_no, name, uom: "Nos" });
    if (error) throw new Error(`component ${name}: ${error.message}`);
    byName.set(name.toLowerCase(), { id: "", no: component_no });
    return component_no;
  }

  // ---- #2: wire variant lines ----
  for (const cfg of CONFIG) {
    const { data: product } = await supa.from("products").select("id").eq("sku_code", cfg.sku).single();
    if (!product) continue;
    const { data: tpl } = await supa
      .from("bom_templates")
      .select("id")
      .eq("product_id", product.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!tpl) continue;

    const { data: lines } = await supa
      .from("bom_template_lines")
      .select("id, component_id, quantity")
      .eq("bom_template_id", tpl.id);
    const compNameById = new Map((comps ?? []).map((c) => [c.id, c.name]));

    let flagged = 0;
    for (const targetName of cfg.lines) {
      const line = (lines ?? []).find(
        (l) => l.component_id && compNameById.get(l.component_id)?.toLowerCase() === targetName.toLowerCase(),
      );
      if (!line) {
        console.log(`  ${cfg.sku}: line "${targetName}" not found, skipping`);
        continue;
      }
      const map: Record<string, { component_no: string; qty: number }> = {};
      for (const size of cfg.options) {
        const sizedName = targetName.replace(`${cfg.nominal}INCH`, `${size}INCH`);
        const no = await ensureComponent(sizedName);
        map[String(size)] = { component_no: no, qty: Number(line.quantity) || 1 };
      }
      const { error } = await supa
        .from("bom_template_lines")
        .update({ is_variant_driven: true, is_common: false, variant_rule: { param: cfg.param, map }, note: NOTE })
        .eq("id", line.id);
      if (error) throw new Error(`${cfg.sku} ${targetName}: ${error.message}`);
      flagged++;
    }
    console.log(`  ${cfg.sku}: flagged ${flagged} variant line(s) driven by ${cfg.param}`);
  }

  console.log("\n⚠️  Triton 3.6K skipped — its nozzle is ~3\", so the seeded 6/8/10/12 options likely need correcting (confirm with Sudhir).");
  console.log("✅ Done.");
}

main().catch((e) => {
  console.error("propose-variant-lines failed:", e?.message ?? e);
  process.exit(1);
});
