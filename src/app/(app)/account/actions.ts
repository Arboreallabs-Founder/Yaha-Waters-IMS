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
