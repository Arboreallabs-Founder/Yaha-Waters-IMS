"use server";

import {
  upsertRecord,
  deleteRecord,
  upsertRaw,
  type ActionResult,
} from "@/lib/server/crud";

const TEMPLATE_FIELDS = {
  product_id: "string",
  component_id: "string",
  version: "number",
  is_active: "boolean",
} as const;

export async function upsert(fd: FormData): Promise<ActionResult> {
  return upsertRecord("bom_templates", TEMPLATE_FIELDS, fd);
}
export async function remove(fd: FormData): Promise<ActionResult> {
  return deleteRecord("bom_templates", fd);
}

// ---- template lines (yellow=common vs variant-driven) ----
export async function upsertTemplateLine(fd: FormData): Promise<ActionResult> {
  const id = (fd.get("id") as string) || null;
  const qtyRaw = String(fd.get("quantity") ?? "").trim();
  const ruleRaw = String(fd.get("variant_rule") ?? "").trim();
  let variant_rule: unknown = null;
  if (ruleRaw) {
    try {
      variant_rule = JSON.parse(ruleRaw);
    } catch {
      return { error: "Variant rule must be valid JSON (or left blank)." };
    }
  }
  const isVariant = fd.get("is_variant_driven") !== null;
  const isAssembly = fd.get("is_assembly") !== null;
  const payload = {
    bom_template_id: String(fd.get("bom_template_id") ?? ""),
    component_id: (fd.get("component_id") as string) || null,
    quantity: qtyRaw === "" ? 0 : Number(qtyRaw),
    is_common: !isVariant, // common = not variant-driven
    is_variant_driven: isVariant,
    variant_rule,
    parent_line_id: (fd.get("parent_line_id") as string) || null,
    line_type: isAssembly ? "assembly" : "component",
    section: String(fd.get("section") ?? "").trim() || null,
    assembly_name: String(fd.get("assembly_name") ?? "").trim() || null,
    note: String(fd.get("note") ?? "").trim() || null,
  };
  if (!payload.component_id && !isVariant) {
    return { error: "Pick a component (or mark the line variant-driven with a rule)." };
  }
  return upsertRaw("bom_template_lines", payload, id);
}
export async function removeTemplateLine(fd: FormData): Promise<ActionResult> {
  return deleteRecord("bom_template_lines", fd);
}
