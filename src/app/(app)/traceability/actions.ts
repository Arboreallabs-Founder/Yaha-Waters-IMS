"use server";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export type ActionResult = { ok?: true; error?: string; data?: unknown };

export async function lookupTraceability(lotCode: string): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile) return { error: "Not authorized." };
  if (!lotCode.trim()) return { error: "Enter or scan a lot code." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_lot_traceability", { p_lot_code: lotCode.trim() });
  if (error) return { error: error.message };
  const res = data as { error?: string; lot?: { component_id?: string } };
  if (res?.error) return { error: res.error };

  if (res?.lot?.component_id) {
    const { data: comp } = await supabase
      .from("components")
      .select("component_no, name")
      .eq("id", res.lot.component_id)
      .maybeSingle();
    if (comp) {
      (res.lot as Record<string, unknown>).component_no = comp.component_no;
      (res.lot as Record<string, unknown>).component_name = comp.name;
    }
  }
  return { ok: true, data: res };
}
