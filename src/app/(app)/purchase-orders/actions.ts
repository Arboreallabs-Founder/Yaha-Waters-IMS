"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ActionResult = {
  ok?: true;
  error?: string;
  id?: string;
  /** Set when raising a PO produces more than one (grouped by supplier). */
  created?: { id: string; po_no: string; vendor_name: string | null }[];
  message?: string;
};

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
      delivery_terms: String(fd.get("delivery_terms") ?? "").trim() || "Urgent",
      payment_terms: String(fd.get("payment_terms") ?? "").trim() || "30 Days",
      freight_terms: String(fd.get("freight_terms") ?? "").trim() || "At Actual",
      gst_percent: num(fd, "gst_percent") ?? 18,
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

// ---- raise draft PO(s) directly from a project's shortfall — one per supplier ----
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

  // Group shortfall lines by each component's raw supplier — a PO goes to one
  // vendor, so components from different suppliers can't share a PO.
  const componentIds = [...new Set(short.map((s) => s.component_id).filter((v): v is string => !!v))];
  const { data: comps } = await supabase.from("components").select("id, raw_supplier_id").in("id", componentIds);
  const supplierByComponent = new Map((comps ?? []).map((c) => [c.id, c.raw_supplier_id as string | null]));

  const byVendor = new Map<string | null, { component_id: string; shortfall_qty: number }[]>();
  for (const s of short) {
    if (!s.component_id) continue;
    const vendorId = supplierByComponent.get(s.component_id) ?? null;
    const group = byVendor.get(vendorId) ?? [];
    group.push({ component_id: s.component_id, shortfall_qty: s.shortfall_qty });
    byVendor.set(vendorId, group);
  }

  const vendorIds = [...byVendor.keys()].filter((v): v is string => v !== null);
  const { data: vendors } = vendorIds.length
    ? await supabase.from("vendors").select("id, name").in("id", vendorIds)
    : { data: [] };
  const vendorName = new Map((vendors ?? []).map((v) => [v.id, v.name as string]));

  const created: { id: string; po_no: string; vendor_name: string | null }[] = [];
  for (const [vendorId, lines] of byVendor) {
    const { data: poNo } = await supabase.rpc("next_po_no");
    const { data: po, error } = await supabase
      .from("purchase_orders")
      .insert({ po_no: poNo, vendor_id: vendorId, status: "draft", source: "system", created_by: p.id })
      .select("id")
      .single();
    if (error) return { error: error.message };
    const poLines = lines.map((s) => ({
      po_id: po.id,
      component_id: s.component_id,
      project_id,
      qty_ordered: s.shortfall_qty,
      created_by: p.id,
    }));
    const { error: lErr } = await supabase.from("po_lines").insert(poLines);
    if (lErr) return { error: lErr.message };
    created.push({ id: po.id, po_no: poNo, vendor_name: vendorId ? vendorName.get(vendorId) ?? null : null });
  }

  revalidatePath("/purchase-orders");
  if (created.length === 1) return { ok: true, id: created[0].id, created };
  return {
    ok: true,
    created,
    message: `Raised ${created.length} POs — one per supplier: ${created.map((c) => c.vendor_name ?? "no supplier tagged").join(", ")}.`,
  };
}
