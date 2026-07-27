"use server";

import {
  upsertRecord,
  deleteRecord,
  upsertRaw,
  parseOptions,
  type ActionResult,
} from "@/lib/server/crud";

const TEMPLATE_FIELDS = {
  name: "string",
  description: "string",
  is_active: "boolean",
} as const;

export async function upsert(fd: FormData): Promise<ActionResult> {
  return upsertRecord("inspection_templates", TEMPLATE_FIELDS, fd);
}
export async function remove(fd: FormData): Promise<ActionResult> {
  return deleteRecord("inspection_templates", fd);
}

// ---- template fields (text / number / choice) ----
export async function upsertTemplateField(fd: FormData): Promise<ActionResult> {
  const id = (fd.get("id") as string) || null;
  const field_type = String(fd.get("field_type") ?? "text");
  const optionsRaw = String(fd.get("options") ?? "").trim();
  const options = field_type === "choice" ? parseOptions(optionsRaw) : null;
  if (field_type === "choice" && (!Array.isArray(options) || options.length === 0)) {
    return { error: "Multiple-choice fields need at least one option." };
  }
  const payload = {
    template_id: String(fd.get("template_id") ?? ""),
    label: String(fd.get("label") ?? "").trim(),
    field_type,
    options,
    is_required: fd.get("is_required") !== null,
    sort_order: Number(fd.get("sort_order") ?? 0) || 0,
  };
  if (!payload.label) return { error: "Field label is required." };
  if (!payload.template_id) return { error: "Missing template." };
  return upsertRaw("inspection_template_fields", payload, id);
}
export async function removeTemplateField(fd: FormData): Promise<ActionResult> {
  // Soft-delete: never hard-delete once irn_answers may reference it.
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "Missing id." };
  return upsertRaw("inspection_template_fields", { is_active: false }, id);
}
