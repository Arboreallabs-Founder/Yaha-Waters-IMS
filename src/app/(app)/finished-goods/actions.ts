"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export type ActionResult = { ok?: true; error?: string };
const PRODUCE = ["admin", "team_lead"];

async function producer() {
  const p = await getProfile();
  return p && PRODUCE.includes(p.role) ? p : null;
}

export async function createFinishedGood(fd: FormData): Promise<ActionResult> {
  const p = await producer();
  if (!p) return { error: "Only Admin / Team Lead can create finished goods." };
  const product_id = String(fd.get("product_id") ?? "");
  if (!product_id) return { error: "Pick a product." };
  const project_line_item_id = String(fd.get("project_line_item_id") ?? "") || null;
  const supabase = await createClient();

  // inherit variant selections from the line item if chosen
  let variant_selections: unknown = null;
  if (project_line_item_id) {
    const { data: li } = await supabase.from("project_line_items").select("variant_selections").eq("id", project_line_item_id).maybeSingle();
    variant_selections = li?.variant_selections ?? null;
  }

  const { data: serial } = await supabase.rpc("next_fg_no");
  const { error } = await supabase.from("finished_goods").insert({
    product_id,
    project_line_item_id,
    serial_no: serial,
    status: String(fd.get("status") ?? "in_production"),
    variant_selections,
    created_by: p.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/finished-goods");
  return { ok: true };
}

export async function updateFgStatus(fd: FormData): Promise<ActionResult> {
  const p = await producer();
  if (!p) return { error: "Not authorized." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("finished_goods")
    .update({ status: String(fd.get("status")) })
    .eq("id", String(fd.get("id")));
  if (error) return { error: error.message };
  revalidatePath("/finished-goods");
  return { ok: true };
}
