"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export type ActionResult = { ok?: true; error?: string; id?: string };

const RECEIVE = ["admin", "team_lead", "team_member"]; // gate staff can receive

async function receiver() {
  const p = await getProfile();
  return p && RECEIVE.includes(p.role) ? p : null;
}

export async function createGrn(fd: FormData): Promise<ActionResult> {
  const p = await receiver();
  if (!p) return { error: "Not authorized to receive goods." };
  const supabase = await createClient();
  const po_id = String(fd.get("po_id") ?? "") || null;

  // vendor: explicit, else inherit from the PO
  let vendor_id = String(fd.get("vendor_id") ?? "") || null;
  if (!vendor_id && po_id) {
    const { data: po } = await supabase.from("purchase_orders").select("vendor_id").eq("id", po_id).maybeSingle();
    vendor_id = po?.vendor_id ?? null;
  }

  const { data: grnNo } = await supabase.rpc("next_grn_no");
  const { data, error } = await supabase
    .from("grns")
    .insert({
      grn_no: grnNo,
      vendor_id,
      challan_no: String(fd.get("challan_no") ?? "") || null,
      po_id,
      received_by: p.id,
      created_by: p.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/grn");
  return { ok: true, id: data.id };
}

export async function addGrnLine(fd: FormData): Promise<ActionResult> {
  const p = await receiver();
  if (!p) return { error: "Not authorized." };
  const grn_id = String(fd.get("grn_id"));
  const component_id = String(fd.get("component_id") ?? "");
  if (!component_id) return { error: "Pick a component." };
  const qty = Number(fd.get("qty_received") ?? 0) || 0;
  if (qty <= 0) return { error: "Enter a received quantity." };
  const unitCostRaw = String(fd.get("unit_cost") ?? "").trim();

  const pieceCount  = Number(fd.get("piece_count")  ?? "") || null;
  const pieceLength = Number(fd.get("piece_length") ?? "") || null;
  const pieceWidth  = Number(fd.get("piece_width")  ?? "") || null;

  const target_lot_id = String(fd.get("target_lot_id") ?? "") || null;

  const supabase = await createClient();
  // Trigger: flags untagged, creates inventory lot(s) per tracking_mode (or adds
  // to target_lot_id box), records receipt movement, rolls up PO qty.
  const { data: line, error } = await supabase.from("grn_lines").insert({
    grn_id,
    component_id,
    qty_received: qty,
    po_line_id: String(fd.get("po_line_id") ?? "") || null,
    project_id: String(fd.get("project_id") ?? "") || null,
    unit_cost: unitCostRaw === "" ? null : Number(unitCostRaw),
    target_lot_id,
    created_by: p.id,
  }).select("id").single();
  if (error) return { error: error.message };

  // If dimensions were supplied (bulk), patch the lot the trigger just created.
  if (target_lot_id === null && (pieceCount !== null || pieceLength !== null || pieceWidth !== null)) {
    await supabase
      .from("inventory_lots")
      .update({ piece_count: pieceCount, piece_length: pieceLength, piece_width: pieceWidth })
      .eq("grn_line_id", line.id);
  }

  revalidatePath(`/grn/${grn_id}`);
  return { ok: true };
}
