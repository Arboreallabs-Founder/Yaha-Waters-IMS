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

function grnDupeError(error: { message: string; code?: string }, challan_no: string | null, invoice_no: string | null): string {
  if (error.code === "23505") {
    if (error.message.includes("uq_grns_challan_per_vendor")) {
      return `Challan No. "${challan_no}" has already been used for a GRN from this vendor.`;
    }
    if (error.message.includes("uq_grns_invoice_per_vendor")) {
      return `Invoice No. "${invoice_no}" has already been used for a GRN from this vendor.`;
    }
  }
  return error.message;
}

export async function createGrn(fd: FormData): Promise<ActionResult> {
  const p = await receiver();
  if (!p) return { error: "Not authorized to receive goods." };
  const challan_no = String(fd.get("challan_no") ?? "").trim() || null;
  const invoice_no = String(fd.get("invoice_no") ?? "").trim() || null;
  if (!challan_no && !invoice_no) {
    return { error: "Enter a challan number or an invoice number — at least one is required." };
  }
  const is_job_work = String(fd.get("is_job_work") ?? "") === "true";
  const vendor_id = String(fd.get("vendor_id") ?? "") || null;
  if (is_job_work && !vendor_id) return { error: "Pick the job-work vendor." };

  const supabase = await createClient();

  const { data: grnNo } = await supabase.rpc(is_job_work ? "next_jw_grn_no" : "next_grn_no");
  const { data, error } = await supabase
    .from("grns")
    .insert({
      grn_no: grnNo,
      vendor_id,
      is_job_work,
      challan_no,
      invoice_no,
      received_by: p.id,
      created_by: p.id,
    })
    .select("id")
    .single();
  if (error) return { error: grnDupeError(error, challan_no, invoice_no) };

  if (!invoice_no) {
    await supabase.rpc("notify_grn_missing_invoice", { p_grn_id: data.id, p_user_id: p.id });
  }

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

  const po_line_id = String(fd.get("po_line_id") ?? "") || null;
  if (!po_line_id) return { error: "Select an open PO line — receiving without a PO is not allowed." };

  const pieceCount  = Number(fd.get("piece_count")  ?? "") || null;
  const pieceLength = Number(fd.get("piece_length") ?? "") || null;
  const pieceWidth  = Number(fd.get("piece_width")  ?? "") || null;
  const pieceWeight = Number(fd.get("piece_weight") ?? "") || null;

  const target_lot_id = String(fd.get("target_lot_id") ?? "") || null;

  const supabase = await createClient();
  // Trigger: flags untagged, creates inventory lot(s) per tracking_mode (or adds
  // to target_lot_id box), records receipt movement, rolls up PO qty.
  const { data: line, error } = await supabase.from("grn_lines").insert({
    grn_id,
    component_id,
    qty_received: qty,
    po_line_id,
    project_id: String(fd.get("project_id") ?? "") || null,
    unit_cost: unitCostRaw === "" ? null : Number(unitCostRaw),
    target_lot_id,
    created_by: p.id,
  }).select("id").single();
  if (error) return { error: error.message };

  // If dimensions were supplied (bulk), patch the lot the trigger just created.
  if (target_lot_id === null && (pieceCount !== null || pieceLength !== null || pieceWidth !== null || pieceWeight !== null)) {
    await supabase
      .from("inventory_lots")
      .update({ piece_count: pieceCount, piece_length: pieceLength, piece_width: pieceWidth, piece_weight: pieceWeight })
      .eq("grn_line_id", line.id);
  }

  revalidatePath(`/grn/${grn_id}`);
  return { ok: true };
}

export async function addJwGrnLine(fd: FormData): Promise<ActionResult> {
  const p = await receiver();
  if (!p) return { error: "Not authorized." };
  const grn_id = String(fd.get("grn_id"));
  const jw_line_id = String(fd.get("jw_line_id") ?? "") || null;
  if (!jw_line_id) return { error: "Select a job-work line to receive." };
  const qty = Number(fd.get("qty") ?? 0) || 0;
  if (qty <= 0) return { error: "Enter a received quantity." };
  const answersRaw = String(fd.get("answers") ?? "").trim();
  const answers = answersRaw ? JSON.parse(answersRaw) : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receive_job_work", {
    p_grn_id: grn_id, p_line_id: jw_line_id, p_qty: qty, p_user_id: p.id, p_answers: answers,
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };

  revalidatePath(`/grn/${grn_id}`);
  revalidatePath("/job-work");
  return { ok: true };
}
