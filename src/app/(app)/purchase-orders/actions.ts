"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { canDeletePurchaseOrders, canApprovePoLine } from "@/lib/roles";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ActionResult = {
  ok?: true;
  error?: string;
  id?: string;
  /** Set when raising a PO produces more than one (grouped by supplier). */
  created?: { id: string; po_no: string; vendor_name: string | null }[];
  message?: string;
  /** Set when an edit to a sent PO created a new revision — client should navigate here. */
  revisedPoId?: string;
};

const LOCKED_PO_ERROR = "This PO is locked — it's been cancelled or superseded by a later revision and can no longer be edited.";

// Editing any of these creates a new revision (or, for header-only changes,
// saves in place) via clone_po_revision — only cancelled/superseded POs are
// permanently locked.
const EDITABLE_SENT_STATUSES = ["sent", "partial", "completed"];

const PROCURE = ["admin", "team_lead"];

async function procurer() {
  const p = await getProfile();
  return p && PROCURE.includes(p.role) ? p : null;
}

function num(fd: FormData, k: string): number | null {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : Number(v);
}

function poNoError(error: { message: string; code?: string }): string {
  if (error.code === "23505") return "A PO with that number already exists.";
  return error.message;
}

function deleteError(error: { message: string; code?: string }): string {
  if (error.code === "23503") return "Can't delete — goods have already been received against this PO.";
  return error.message;
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
  const manualPoNo = String(fd.get("po_no") ?? "").trim();
  const poNo = manualPoNo || (await supabase.rpc("next_po_no")).data;
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
  if (error) return { error: poNoError(error) };
  revalidatePath("/purchase-orders");
  return { ok: true, id: data.id };
}

export async function updatePO(fd: FormData): Promise<ActionResult> {
  const p = await procurer();
  if (!p) return { error: "Not authorized." };
  const id = String(fd.get("id"));
  const supabase = await createClient();

  const { data: po } = await supabase.from("purchase_orders").select("status, vendor_id").eq("id", id).single();
  if (!po) return { error: "PO not found." };
  if (po.status !== "draft" && !EDITABLE_SENT_STATUSES.includes(po.status)) return { error: LOCKED_PO_ERROR };

  const po_no = String(fd.get("po_no") ?? "").trim();
  if (!po_no) return { error: "PO No. is required." };
  const vendor_id = String(fd.get("vendor_id") ?? "") || null;

  // Changing the vendor on an already-sent/partial/completed PO changes
  // who's fulfilling the order — treat it as a revision-triggering change,
  // same as a line edit.
  if (EDITABLE_SENT_STATUSES.includes(po.status) && vendor_id !== po.vendor_id) {
    const { data: result, error } = await supabase.rpc("clone_po_revision", {
      p_old_po_id: id,
      p_kind: "header_vendor",
      p_line_id: null,
      p_patch: { vendor_id },
      p_actor: p.id,
    });
    if (error) return { error: error.message };
    const res = result as { error?: string; id?: string };
    if (res?.error) return { error: res.error };
    revalidatePath("/purchase-orders");
    revalidatePath(`/purchase-orders/${res.id}`);
    return { ok: true, id: res.id, revisedPoId: res.id };
  }

  const patch: Record<string, unknown> = {
    po_no,
    vendor_id,
    po_date: String(fd.get("po_date") ?? "") || null,
    delivery_terms: String(fd.get("delivery_terms") ?? "").trim() || "Urgent",
    payment_terms: String(fd.get("payment_terms") ?? "").trim() || "30 Days",
    freight_terms: String(fd.get("freight_terms") ?? "").trim() || "At Actual",
    delivery_address: String(fd.get("delivery_address") ?? "").replace(/\r\n/g, "\n").trim() || null,
    gst_percent: num(fd, "gst_percent") ?? 18,
  };
  // Status is only ever manually settable while still draft, and only into
  // draft/sent/cancelled — partial/completed are automation-only outcomes
  // of GRN receiving. Ignored entirely once status has already moved on,
  // regardless of what's in the submitted form.
  if (po.status === "draft") {
    const status = String(fd.get("status") ?? "draft");
    if (!["draft", "sent", "cancelled"].includes(status)) return { error: "Invalid status." };
    patch.status = status;
  }

  const { error } = await supabase.from("purchase_orders").update(patch).eq("id", id);
  if (error) return { error: poNoError(error) };
  revalidatePath(`/purchase-orders/${id}`);
  return { ok: true };
}

export async function removePO(fd: FormData): Promise<ActionResult> {
  const p = await getProfile();
  if (!p) return { error: "Not authorized." };
  const id = String(fd.get("id"));
  const supabase = await createClient();
  const { data: po } = await supabase.from("purchase_orders").select("status, revision_no, superseded_by, root_po_id").eq("id", id).single();
  if (!po) return { error: "PO not found." };
  if (!canDeletePurchaseOrders(p.role, po)) {
    return { error: "Only Admin / Founder can delete this PO, or Admin / Team Lead for an unrevised draft." };
  }

  // Deleting any PO in a revision chain deletes the whole lineage together
  // (the original + every R1/R2/... revision) — not just the one row you're
  // looking at. RLS still checks each row individually, so a Team Lead's
  // narrower rule (only a lone, never-revised draft) still applies: for
  // them this lineage query only ever resolves to the single row anyway.
  const rootId = po.root_po_id ?? id;
  const { data: lineage } = await supabase.from("purchase_orders").select("id").or(`id.eq.${rootId},root_po_id.eq.${rootId}`);
  const ids = (lineage ?? []).map((r) => r.id);

  const { error } = await supabase.from("purchase_orders").delete().in("id", ids.length ? ids : [id]);
  if (error) return { error: deleteError(error) };
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
  const project_id = String(fd.get("project_id") ?? "") || null;
  const expected_date = String(fd.get("expected_date") ?? "") || null;

  const supabase = await createClient();
  const { data: po } = await supabase.from("purchase_orders").select("status").eq("id", po_id).single();
  if (!po) return { error: "PO not found." };

  if (EDITABLE_SENT_STATUSES.includes(po.status)) {
    const { data: result, error } = await supabase.rpc("clone_po_revision", {
      p_old_po_id: po_id,
      p_kind: "add",
      p_line_id: null,
      p_patch: { component_id, project_id, qty_ordered: qty, rate, amount, expected_date },
      p_actor: p.id,
    });
    if (error) return { error: error.message };
    const res = result as { error?: string; id?: string };
    if (res?.error) return { error: res.error };
    revalidatePath("/purchase-orders");
    revalidatePath(`/purchase-orders/${res.id}`);
    return { ok: true, id: res.id, revisedPoId: res.id };
  }
  if (po.status !== "draft") return { error: LOCKED_PO_ERROR };

  const { error } = await supabase.from("po_lines").insert({
    po_id, component_id, project_id, qty_ordered: qty, rate, amount, expected_date, created_by: p.id,
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
  const component_id = String(fd.get("component_id") ?? "") || null;
  const project_id = String(fd.get("project_id") ?? "") || null;
  const expected_date = String(fd.get("expected_date") ?? "") || null;

  const supabase = await createClient();
  const [{ data: po }, { data: line }] = await Promise.all([
    supabase.from("purchase_orders").select("status").eq("id", po_id).single(),
    supabase.from("po_lines").select("component_id, qty_ordered, rate").eq("id", id).single(),
  ]);
  if (!po) return { error: "PO not found." };
  if (!line) return { error: "Line not found." };

  // "What was ordered" — component/qty/rate — is what triggers a revision
  // on a sent PO. project_id/expected_date aren't part of the order itself
  // and always save in place.
  const contentChanged =
    (component_id ?? line.component_id) !== line.component_id ||
    qty !== Number(line.qty_ordered) ||
    rate !== (line.rate == null ? null : Number(line.rate));

  if (EDITABLE_SENT_STATUSES.includes(po.status) && contentChanged) {
    const { data: result, error } = await supabase.rpc("clone_po_revision", {
      p_old_po_id: po_id,
      p_kind: "update",
      p_line_id: id,
      p_patch: { component_id, project_id, qty_ordered: qty, rate, amount, expected_date },
      p_actor: p.id,
    });
    if (error) return { error: error.message };
    const res = result as { error?: string; id?: string };
    if (res?.error) return { error: res.error };
    revalidatePath("/purchase-orders");
    revalidatePath(`/purchase-orders/${res.id}`);
    return { ok: true, id: res.id, revisedPoId: res.id };
  }
  if (po.status !== "draft" && !EDITABLE_SENT_STATUSES.includes(po.status)) return { error: LOCKED_PO_ERROR };

  const { error } = await supabase
    .from("po_lines")
    .update({ project_id, qty_ordered: qty, rate, amount, expected_date })
    .eq("id", id);
  if (error) return { error: error.message };
  await recomputePoTotal(supabase, po_id);
  revalidatePath(`/purchase-orders/${po_id}`);
  return { ok: true };
}

export async function removePoLine(fd: FormData): Promise<ActionResult> {
  const p = await procurer();
  if (!p) return { error: "Not authorized." };
  const id = String(fd.get("id"));
  const po_id = String(fd.get("po_id"));
  const supabase = await createClient();
  const { data: po } = await supabase.from("purchase_orders").select("status").eq("id", po_id).single();
  if (!po) return { error: "PO not found." };

  if (EDITABLE_SENT_STATUSES.includes(po.status)) {
    const { data: result, error } = await supabase.rpc("clone_po_revision", {
      p_old_po_id: po_id,
      p_kind: "remove",
      p_line_id: id,
      p_patch: {},
      p_actor: p.id,
    });
    if (error) return { error: error.message };
    const res = result as { error?: string; id?: string };
    if (res?.error) return { error: res.error };
    revalidatePath("/purchase-orders");
    revalidatePath(`/purchase-orders/${res.id}`);
    return { ok: true, id: res.id, revisedPoId: res.id };
  }
  if (po.status !== "draft") return { error: LOCKED_PO_ERROR };

  const { error } = await supabase.from("po_lines").delete().eq("id", id);
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

// ---- price approval: only Admin (the price gate governs team_lead) ----
async function approver() {
  const p = await getProfile();
  return p && canApprovePoLine(p.role) ? p : null;
}

export async function approvePoLine(fd: FormData): Promise<ActionResult> {
  const p = await approver();
  if (!p) return { error: "Only Admin can approve a PO line price." };
  const line_id = String(fd.get("line_id") ?? "");
  if (!line_id) return { error: "Missing PO line." };
  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc("approve_po_line", { p_line_id: line_id, p_approver_id: p.id });
  if (error) return { error: error.message };
  const res = result as { error?: string };
  if (res?.error) return { error: res.error };
  revalidatePath("/purchase-orders");
  return { ok: true };
}

export async function rejectPoLine(fd: FormData): Promise<ActionResult> {
  const p = await approver();
  if (!p) return { error: "Only Admin can reject a PO line price." };
  const line_id = String(fd.get("line_id") ?? "");
  const reason = String(fd.get("reason") ?? "").trim();
  if (!line_id) return { error: "Missing PO line." };
  if (!reason) return { error: "Enter a rejection reason." };
  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc("reject_po_line", { p_line_id: line_id, p_approver_id: p.id, p_reason: reason });
  if (error) return { error: error.message };
  const res = result as { error?: string };
  if (res?.error) return { error: res.error };
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
