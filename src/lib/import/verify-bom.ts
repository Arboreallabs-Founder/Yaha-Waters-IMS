/**
 * Pure unit test for the variant→BOM engine (no DB).
 *   npx tsx src/lib/import/verify-bom.ts
 * PRD case: Triton 12K @ Inlet 8" / 200µm × 2 → common lines ×2 + variant nozzle (8") ×2.
 */
import { expandBomLines, type TemplateLine } from "../bom-engine";

const PRODUCT = "triton-12k";
const TEMPLATE = "tpl-1";

const templateByProduct = new Map<string, string>([[PRODUCT, TEMPLATE]]);
const compByNo = new Map<string, string>([
  ["bolt-t", "c-bolt"],
  ["gasket-t", "c-gasket"],
  ["noz-6", "c-noz6"],
  ["noz-8", "c-noz8"],
]);
const linesByTemplate = new Map<string, TemplateLine[]>([
  [
    TEMPLATE,
    [
      { component_id: "c-bolt", quantity: 4, is_variant_driven: false, variant_rule: null },
      { component_id: "c-gasket", quantity: 2, is_variant_driven: false, variant_rule: null },
      {
        component_id: null,
        quantity: 1,
        is_variant_driven: true,
        variant_rule: {
          param: "Inlet Size",
          map: { "6": { component_no: "NOZ-6", qty: 1 }, "8": { component_no: "NOZ-8", qty: 1 } },
        },
      },
    ],
  ],
]);

const { lines } = expandBomLines({
  items: [
    { id: "li-1", product_id: PRODUCT, variant_selections: { "Inlet Size": 8, Micron: 200 }, quantity: 2 },
  ],
  templateByProduct,
  linesByTemplate,
  compByNo,
});

const idToName: Record<string, string> = {
  "c-bolt": "BOLT-T",
  "c-gasket": "GASKET-T",
  "c-noz6": "NOZ-6",
  "c-noz8": "NOZ-8",
};
const got = lines.map((l) => ({ component: idToName[l.component_id], qty: l.required_qty })).sort((a, b) => a.component.localeCompare(b.component));
console.table(got);

const expected = [
  { component: "BOLT-T", qty: 8 },
  { component: "GASKET-T", qty: 4 },
  { component: "NOZ-8", qty: 2 },
];
const ok =
  got.length === 3 &&
  expected.every((e) => got.some((g) => g.component === e.component && g.qty === e.qty)) &&
  !got.some((g) => g.component === "NOZ-6");

console.log(ok ? '\n✅ PASS — common ×2 + variant nozzle (8") ×2, no 6" nozzle.' : "\n❌ FAIL");
if (!ok) process.exit(1);
