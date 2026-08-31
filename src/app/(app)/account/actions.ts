"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export type ActionResult = { ok?: true; error?: string; id?: string };

/** Create a saved signature for the current user (self-service — no admin path). */
export async function createSignature(fd: FormData): Promise<ActionResult> {
  const p = await getProfile();
  if (!p) return { error: "Not authorized." };
  const method = String(fd.get("method") ?? "");
  if (!["typed", "drawn"].includes(method)) return { error: "Invalid signature method." };
  const image_data_url = String(fd.get("image_data_url") ?? "");
  if (!image_data_url) return { error: "Missing signature image." };
  const label = String(fd.get("label") ?? "").trim() || null;
  const typed_text = String(fd.get("typed_text") ?? "").trim() || null;
  const typed_font = String(fd.get("typed_font") ?? "").trim() || null;
  const is_default = String(fd.get("is_default") ?? "") === "true";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("signatures")
    .insert({ user_id: p.id, method, image_data_url, label, typed_text, typed_font, is_default })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/account/signature");
  return { ok: true, id: data.id };
}

export async function updateSignature(fd: FormData): Promise<ActionResult> {
  const p = await getProfile();
  if (!p) return { error: "Not authorized." };
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "Missing signature." };
  const label = String(fd.get("label") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.from("signatures").update({ label }).eq("id", id).eq("user_id", p.id);
  if (error) return { error: error.message };
  revalidatePath("/account/signature");
  return { ok: true };
}

export async function deleteSignature(fd: FormData): Promise<ActionResult> {
  const p = await getProfile();
  if (!p) return { error: "Not authorized." };
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "Missing signature." };

  const supabase = await createClient();
  const { error } = await supabase.from("signatures").delete().eq("id", id).eq("user_id", p.id);
  if (error) return { error: error.message };
  revalidatePath("/account/signature");
  return { ok: true };
}

export async function setDefaultSignature(fd: FormData): Promise<ActionResult> {
  const p = await getProfile();
  if (!p) return { error: "Not authorized." };
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "Missing signature." };

  const supabase = await createClient();
  const { error } = await supabase.from("signatures").update({ is_default: true }).eq("id", id).eq("user_id", p.id);
  if (error) return { error: error.message };
  revalidatePath("/account/signature");
  return { ok: true };
}

/** Save this device's Web Push subscription for the current user (called right after the browser grants permission). */
export async function savePushSubscription(fd: FormData): Promise<ActionResult> {
  const p = await getProfile();
  if (!p) return { error: "Not authorized." };
  const endpoint = String(fd.get("endpoint") ?? "");
  const p256dh = String(fd.get("p256dh") ?? "");
  const auth = String(fd.get("auth") ?? "");
  const user_agent = String(fd.get("user_agent") ?? "").slice(0, 255) || null;
  if (!endpoint || !p256dh || !auth) return { error: "Invalid subscription." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ user_id: p.id, endpoint, p256dh, auth, user_agent }, { onConflict: "endpoint" });
  if (error) return { error: error.message };
  return { ok: true };
}

/** Remove this device's Web Push subscription (e.g. user disables notifications). */
export async function removePushSubscription(fd: FormData): Promise<ActionResult> {
  const p = await getProfile();
  if (!p) return { error: "Not authorized." };
  const endpoint = String(fd.get("endpoint") ?? "");
  if (!endpoint) return { error: "Missing endpoint." };

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", p.id).eq("endpoint", endpoint);
  if (error) return { error: error.message };
  return { ok: true };
}
