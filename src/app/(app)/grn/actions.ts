"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { formatNumber } from "@/lib/utils";

export type ActionResult = { ok?: true; error?: string; id?: string; status?: string };

const RECEIVE = ["admin", "team_lead", "team_member", "floor"]; // gate staff can receive

async function receiver() {
  const p = await getProfile();
  return p && RECEIVE.includes(p.role) ? p : null;
}

/** Sign-off chain (creator, then any configured approvers) — required before the GRN/MRIN can be printed. */
export async function signGrn(fd: FormData): Promise<ActionResult & { fully_signed?: boolean }> {
  const p = await getProfile();
  if (!p) return { error: "Not authorized." };
  const grn_id = String(fd.get("document_id") ?? "");
  const signature_id = String(fd.get("signature_id") ?? "");
  if (!grn_id || !signature_id) return { error: "Missing document or signature." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sign_grn", { p_grn_id: grn_id, p_signature_id: signature_id, p_actor: p.id });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  revalidatePath(`/grn/${grn_id}`);
  return { ok: true, fully_signed: data?.fully_signed };
}

/** Sign & Send: the creator signs a draft GRN, which sends it to the approver. */
export async function sendGrn(fd: FormData): Promise<ActionResult & { fully_signed?: boolean }> {
  const p = await getProfile();
  if (!p) return { error: "Not authorized." };
  const grn_id = String(fd.get("document_id") ?? "");
  const signature_id = String(fd.get("signature_id") ?? "");
  if (!grn_id || !signature_id) return { error: "Missing document or signature." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_grn", { p_grn_id: grn_id, p_signature_id: signature_id });
  if (error) return { error: error.message };
  const res = data as { error?: string; fully_signed?: boolean } | null;
  if (res?.error) return { error: res.error };
  revalidatePath(`/grn/${grn_id}`);
  revalidatePath("/grn");
  return { ok: true, fully_signed: res?.fully_signed };
}

/** Draft only (creator or Admin): change the challan / invoice number. */
export async function updateDraftGrn(fd: FormData): Promise<ActionResult> {
  const grn_id = String(fd.get("grn_id") ?? "");
  const challan_no = String(fd.get("challan_no") ?? "").trim() || null;
  const invoice_no = String(fd.get("invoice_no") ?? "").trim() || null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_draft_grn", { p_grn_id: grn_id, p_challan_no: challan_no ?? "", p_invoice_no: invoice_no ?? "" });
  if (error) return { error: grnDupeError(error, challan_no, invoice_no) };
  const res = data as { error?: string } | null;
  if (res?.error) return { error: res.error };
  revalidatePath(`/grn/${grn_id}`);
  revalidatePath("/grn");
  return { ok: true };
}

/** Draft only (creator or Admin): take a wrongly added line or inspection off the GRN. */
export async function removeDraftGrnItem(fd: FormData): Promise<ActionResult> {
  const grn_id = String(fd.get("grn_id") ?? "");
  const line_id = String(fd.get("line_id") ?? "") || undefined;
  const irn_id = String(fd.get("irn_id") ?? "") || undefined;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_draft_grn_item", { p_grn_id: grn_id, p_line_id: line_id, p_irn_id: irn_id });
  if (error) return { error: error.message };
  const res = data as { error?: string } | null;
  if (res?.error) return { error: res.error };
  revalidatePath(`/grn/${grn_id}`);
  return { ok: true };
}

/** Draft only (creator or Admin): delete the whole draft and everything on it. */
export async function deleteDraftGrn(fd: FormData): Promise<ActionResult> {
  const grn_id = String(fd.get("grn_id") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_draft_grn", { p_grn_id: grn_id });
  if (error) return { error: error.message };
  const res = data as { error?: string } | null;
  if (res?.error) return { error: res.error };
  revalidatePath("/grn");
  return { ok: true };
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

  // A new GRN is a draft: no signature yet, and nobody is notified. Its
  // creator adds the components, then presses Sign & Send (sendGrn).

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

  const po_line_id = String(fd.get("po_line_id") ?? "") || null;
  if (!po_line_id) return { error: "Select an open PO line — receiving without a PO is not allowed." };

  const pieceCount  = Number(fd.get("piece_count")  ?? "") || null;
  const pieceLength = Number(fd.get("piece_length") ?? "") || null;
  const pieceWidth  = Number(fd.get("piece_width")  ?? "") || null;
  const pieceWeight = Number(fd.get("piece_weight") ?? "") || null;

  const target_lot_id = String(fd.get("target_lot_id") ?? "") || null;

  const supabase = await createClient();

  // Block over-receipt: this line may not push the PO line's total received
  // quantity above what was ordered. Summed off grn_lines directly, not
  // po_lines.qty_received — that rollup only counts lines whose GRN is fully
  // signed (see migration 0096), so it lags behind while a receipt is still
  // pending signature. Matching the DB trigger's own check here means this
  // friendly message and the trigger's hard stop agree on the same number.
  const { data: poLine } = await supabase
    .from("po_lines")
    .select("qty_ordered")
    .eq("id", po_line_id)
    .maybeSingle();
  if (poLine) {
    const { data: existingLines } = await supabase
      .from("grn_lines")
      .select("qty_received")
      .eq("po_line_id", po_line_id);
    const ordered = Number(poLine.qty_ordered ?? 0);
    const received = (existingLines ?? []).reduce((s, l) => s + Number(l.qty_received ?? 0), 0);
    const remaining = ordered - received;
    if (qty > remaining + 1e-6) {
      return {
        error:
          `This PO line has ${formatNumber(remaining)} left to receive ` +
          `(ordered ${formatNumber(ordered)}, already received or pending ${formatNumber(received)}). ` +
          `You entered ${formatNumber(qty)}. Revise the PO quantity if the supplier sent more.`,
      };
    }
  }

  // Trigger: flags untagged, and — once this GRN is fully signed — creates
  // inventory lot(s) per tracking_mode (or adds to target_lot_id box),
  // records the receipt movement, and rolls up PO qty. Until then the line
  // sits recorded but uncounted; piece dimensions travel on the row itself
  // (not patched onto a lot afterward) so they survive whichever happens.
  const { error } = await supabase.from("grn_lines").insert({
    grn_id,
    component_id,
    qty_received: qty,
    po_line_id,
    project_id: String(fd.get("project_id") ?? "") || null,
    target_lot_id,
    piece_count: pieceCount,
    piece_length: pieceLength,
    piece_width: pieceWidth,
    piece_weight: pieceWeight,
    created_by: p.id,
  }).select("id").single();
  if (error) return { error: error.message };

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
  // Best-effort: attach the receiver's saved signature so an Admin / Team Lead
  // receipt of a templated component auto-approves its IRN inline — same
  // no-op-if-missing pattern as submitIrn() for PO-based GRNs.
  const { data: mySig } = await supabase
    .from("signatures")
    .select("id")
    .eq("user_id", p.id)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase.rpc("receive_job_work", {
    p_grn_id: grn_id, p_line_id: jw_line_id, p_qty: qty, p_user_id: p.id, p_answers: answers,
    p_signature_id: mySig?.id ?? null,
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };

  revalidatePath(`/grn/${grn_id}`);
  revalidatePath("/job-work");
  return { ok: true, status: data?.status ?? undefined };
}
