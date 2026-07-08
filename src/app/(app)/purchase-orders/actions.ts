"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ActionResult = { ok?: true; error?: string; id?: string };

const PROCURE = ["admin", "team_lead"];

async function procurer() {
  const p = await getProfile();
  return p && PROCURE.includes(p.role) ? p : null;
}

function num(fd: FormData, k: string): number | null {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : Number(v);
}

async function recomputePoTotal(supabase: SupabaseClient, po_id: string) {
  const { data } = await supabase.from("po_lines").select("amount").eq("po_id", po_id);
  const total = (data ?? []).reduce((s, l) => s + Number(l.amount ?? 0), 0);
  await supabase.from("purchase_orders").update({ total_amount: total || null }).eq("id", po_id);
}

export async function createPO(fd: FormData): Promise<ActionResult> {
  const p = await procurer();
  if (!p) return { error: "Only Admin / Team Lead can raise POs." };
  const supabase = await createClient();
  const { data: poNo } = await supabase.rpc("next_po_no");
  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({
      po_no: poNo,
      vendor_id: String(fd.get("vendor_id") ?? "") || null,
      po_date: String(fd.get("po_date") ?? "") || null,
      status: "draft",
      source: "system",
      created_by: p.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/purchase-orders");
  return { ok: true, id: data.id };
}

export async function updatePO(fd: FormData): Promise<ActionResult> {
  const p = await procurer();
  if (!p) return { error: "Not authorized." };
  const id = String(fd.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({
      vendor_id: String(fd.get("vendor_id") ?? "") || null,
      po_date: String(fd.get("po_date") ?? "") || null,
      status: String(fd.get("status") ?? "draft"),
      invoice_no: String(fd.get("invoice_no") ?? "") || null,
      invoice_status: String(fd.get("invoice_status") ?? "") || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/purchase-orders/${id}`);
  return { ok: true };
}

export async function removePO(fd: FormData): Promise<ActionResult> {
  const p = await procurer();
  if (!p) return { error: "Not authorized." };
  const supabase = await createClient();
  const { error } = await supabase.from("purchase_orders").delete().eq("id", String(fd.get("id")));
  if (error) return { error: error.message };
  revalidatePath("/purchase-orders");
  return { ok: true };
}

export async function addPoLine(fd: FormData): Promise<ActionResult> {
  const p = await procurer();
  if (!p) return { error: "Not authorized." };
  const po_id = String(fd.get("po_id"));
  const component_id = String(fd.get("component_id") ?? "");
  if (!component_id) return { error: "Pick a component." };
  const qty = num(fd, "qty_ordered") ?? 0;
  const rate = num(fd, "rate");
  let amount = num(fd, "amount");
  if (amount == null && rate != null) amount = rate * qty;
  const supabase = await createClient();
  const { error } = await supabase.from("po_lines").insert({
    po_id,
    component_id,
    project_id: String(fd.get("project_id") ?? "") || null,
    qty_ordered: qty,
    rate,
    amount,
    expected_date: String(fd.get("expected_date") ?? "") || null,
    created_by: p.id,
  });
  if (error) return { error: error.message };
  await recomputePoTotal(supabase, po_id);
  revalidatePath(`/purchase-orders/${po_id}`);
  return { ok: true };
}

export async function updatePoLine(fd: FormData): Promise<ActionResult> {
  const p = await procurer();
  if (!p) return { error: "Not authorized." };
  const id = String(fd.get("id"));
  const po_id = String(fd.get("po_id"));
  const qty = num(fd, "qty_ordered") ?? 0;
  const rate = num(fd, "rate");
  let amount = num(fd, "amount");
  if (amount == null && rate != null) amount = rate * qty;
  const supabase = await createClient();
  const { error } = await supabase
    .from("po_lines")
    .update({
      project_id: String(fd.get("project_id") ?? "") || null, // back-fill / change project tag
      qty_ordered: qty,
      rate,
      amount,
      expected_date: String(fd.get("expected_date") ?? "") || null,
      line_status: String(fd.get("line_status") ?? "pending"),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  await recomputePoTotal(supabase, po_id);
  revalidatePath(`/purchase-orders/${po_id}`);
  return { ok: true };
}

export async function removePoLine(fd: FormData): Promise<ActionResult> {
  const p = await procurer();
  if (!p) return { error: "Not authorized." };
  const po_id = String(fd.get("po_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("po_lines").delete().eq("id", String(fd.get("id")));
  if (error) return { error: error.message };
  await recomputePoTotal(supabase, po_id);
  revalidatePath(`/purchase-orders/${po_id}`);
  return { ok: true };
}

// ---- back-fill a PO line's project tag (worklist) ----
export async function backfillProjectTag(fd: FormData): Promise<ActionResult> {
  const p = await procurer();
  if (!p) return { error: "Not authorized." };
  const id = String(fd.get("id"));
  const project_id = String(fd.get("project_id") ?? "") || null;
  const supabase = await createClient();
  const { error } = await supabase.from("po_lines").update({ project_id }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/purchase-orders");
  return { ok: true };
}

// ---- convert a requisition into a PO ----
export async function convertRequisitionToPO(fd: FormData): Promise<ActionResult> {
  const p = await procurer();
  if (!p) return { error: "Only Admin / Team Lead can raise POs." };
  const requisition_id = String(fd.get("requisition_id"));
  const supabase = await createClient();

  const { data: req } = await supabase
    .from("requisitions")
    .select("id, project_id")
    .eq("id", requisition_id)
    .single();
  if (!req) return { error: "Requisition not found." };
  const { data: lines } = await supabase
    .from("requisition_lines")
    .select("id, component_id, qty")
    .eq("requisition_id", requisition_id);
  if (!lines || lines.length === 0) return { error: "Requisition has no lines." };

  const { data: poNo } = await supabase.rpc("next_po_no");
  const { data: po, error } = await supabase
    .from("purchase_orders")
    .insert({ po_no: poNo, vendor_id: String(fd.get("vendor_id") ?? "") || null, status: "draft", source: "system", created_by: p.id })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const poLines = lines.map((l) => ({
    po_id: po.id,
    component_id: l.component_id,
    project_id: req.project_id,
    requisition_line_id: l.id,
    qty_ordered: l.qty,
    created_by: p.id,
  }));
  const { error: lErr } = await supabase.from("po_lines").insert(poLines);
  if (lErr) return { error: lErr.message };

  await supabase.from("requisitions").update({ status: "ordered" }).eq("id", requisition_id);
  revalidatePath(`/requisitions/${requisition_id}`);
  revalidatePath("/purchase-orders");
  return { ok: true, id: po.id };
}

// ---- raise a draft PO directly from a project's shortfall ----
export async function raisePoFromShortfall(fd: FormData): Promise<ActionResult> {
  const p = await procurer();
  if (!p) return { error: "Only Admin / Team Lead can raise POs." };
  const project_id = String(fd.get("project_id"));
  const supabase = await createClient();
  const { data: short } = await supabase
    .from("v_project_shortfall")
    .select("component_id, shortfall_qty")
    .eq("project_id", project_id)
    .gt("shortfall_qty", 0);
  if (!short || short.length === 0) return { error: "No shortfall to order." };

  const { data: poNo } = await supabase.rpc("next_po_no");
  const { data: po, error } = await supabase
    .from("purchase_orders")
    .insert({ po_no: poNo, status: "draft", source: "system", created_by: p.id })
    .select("id")
    .single();
  if (error) return { error: error.message };
  const poLines = short.map((s) => ({
    po_id: po.id,
    component_id: s.component_id,
    project_id,
    qty_ordered: s.shortfall_qty,
    created_by: p.id,
  }));
  const { error: lErr } = await supabase.from("po_lines").insert(poLines);
  if (lErr) return { error: lErr.message };
  revalidatePath("/purchase-orders");
  return { ok: true, id: po.id };
}
