"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export type ActionResult = { ok?: true; error?: string; message?: string; id?: string };

const SITE_PURCHASE_ROLES = ["admin", "team_lead", "team_member"];

// ---------- log a site purchase (buy + consume in one step) ----------
export async function logSitePurchase(fd: FormData): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile || !SITE_PURCHASE_ROLES.includes(profile.role)) return { error: "Not authorized." };

  const project_id = String(fd.get("project_id") ?? "");
  const component_id = String(fd.get("component_id") ?? "");
  const qty = Number(fd.get("qty") ?? 0);
  const unit_cost_raw = String(fd.get("unit_cost") ?? "").trim();
  const vendor_id_raw = String(fd.get("vendor_id") ?? "").trim();
  const vendor_name = String(fd.get("vendor_name") ?? "").trim();
  const note = String(fd.get("note") ?? "").trim();

  if (!project_id || !component_id) return { error: "Pick a component." };
  if (!qty || qty <= 0) return { error: "Quantity must be positive." };

  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc("create_site_purchase", {
    p_project: project_id,
    p_component: component_id,
    p_qty: qty,
    p_unit_cost: unit_cost_raw ? Number(unit_cost_raw) : null,
    p_vendor: vendor_id_raw || null,
    p_vendor_name: vendor_name || null,
    p_note: note || null,
    p_user_id: profile.id,
  });
  if (error) return { error: error.message };
  const res = result as { error?: string; ok?: boolean; id?: string; purchase_no?: string };
  if (res?.error) return { error: res.error };

  revalidatePath(`/projects/${project_id}`);
  return { ok: true, id: res.id, message: `Logged ${res.purchase_no} — added to the BOM and consumed.` };
}

// ---------- notifications ----------
export async function markNotificationRead(fd: FormData): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile) return { error: "Not authorized." };
  const notification_id = String(fd.get("notification_id") ?? "");
  if (!notification_id) return { error: "Missing notification." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_reads")
    .upsert({ notification_id, profile_id: profile.id }, { onConflict: "notification_id,profile_id" });
  if (error) return { error: error.message };
  return { ok: true };
}
