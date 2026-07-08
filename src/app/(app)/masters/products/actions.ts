"use server";

import {
  deleteRecord,
  upsertRaw,
  parseOptions,
  type ActionResult,
} from "@/lib/server/crud";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters } from "@/lib/auth";

export async function upsert(fd: FormData): Promise<ActionResult> {
  const profile = await getProfile();
  if (!canWriteMasters(profile?.role)) return { error: "You don't have permission to edit master data." };

  const supabase = await createClient();
  const id = fd.get("id") as string | null;

  const payload = {
    sku_code: (fd.get("sku_code") as string)?.trim() || null,
    model_name: (fd.get("model_name") as string)?.trim() || null,
    category_id: (fd.get("category_id") as string)?.trim() || null,
    description: (fd.get("description") as string)?.trim() || null,
    is_serialized: (() => {
      const v = fd.get("is_serialized");
      return v !== null && v !== "false" && v !== "off";
    })(),
  };

  if (id) {
    // Edit — plain update, no redirect
    const { error } = await (supabase.from("products") as any).update(payload).eq("id", id);
    if (error) return { error: error.message };
    return { ok: true };
  }

  // Create — insert product then auto-create BOM template
  const { data: product, error: prodErr } = await (supabase.from("products") as any)
    .insert({ ...payload, created_by: profile!.id })
    .select("id")
    .single();
  if (prodErr) return { error: prodErr.message };

  const { data: bom, error: bomErr } = await (supabase.from("bom_templates") as any)
    .insert({ product_id: product.id, version: 1, is_active: true, created_by: profile!.id })
    .select("id")
    .single();
  if (bomErr) return { error: bomErr.message };

  return { ok: true, redirect: `/masters/bom-templates/${bom.id}` };
}

export async function remove(fd: FormData): Promise<ActionResult> {
  return deleteRecord("products", fd);
}

// ---- variant params (the founder's "dropdowns") ----
export async function upsertVariantParam(fd: FormData): Promise<ActionResult> {
  const id = (fd.get("id") as string) || null;
  const num = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v === "" ? null : Number(v);
  };
  const payload = {
    product_id: String(fd.get("product_id") ?? ""),
    name: String(fd.get("name") ?? "").trim(),
    input_type: String(fd.get("input_type") ?? "dropdown"),
    options: parseOptions(String(fd.get("options") ?? "")),
    min_value: num("min_value"),
    max_value: num("max_value"),
    uom: String(fd.get("uom") ?? "").trim() || null,
    sort_order: num("sort_order") ?? 0,
  };
  if (!payload.name) return { error: "Parameter name is required." };
  return upsertRaw("product_variant_params", payload, id);
}
export async function removeVariantParam(fd: FormData): Promise<ActionResult> {
  return deleteRecord("product_variant_params", fd);
}
