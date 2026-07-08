"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export type ActionResult = { ok?: true; error?: string };

/** Tag an untagged goods-receipt line to a project (clears it from the untagged worklist). */
export async function backfillGrnProject(fd: FormData): Promise<ActionResult> {
  const p = await getProfile();
  if (!p || !["admin", "team_lead"].includes(p.role)) return { error: "Only Admin / Team Lead can tag receipts." };
  const id = String(fd.get("id"));
  const project_id = String(fd.get("project_id") ?? "") || null;
  if (!project_id) return { error: "Pick a project." };
  const supabase = await createClient();
  // tagging to a project resolves the untagged state → clears it from the worklist
  const { error } = await supabase.from("grn_lines").update({ project_id, is_untagged: false }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/reconciliation");
  return { ok: true };
}
