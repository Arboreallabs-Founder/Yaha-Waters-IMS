"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export type ActionResult = {
  ok?: true;
  error?: string;
  id?: string;
  /** Set when raising job-work produces more than one order (grouped by JW vendor). */
  created?: { id: string; jw_no: string; vendor_name: string | null }[];
  message?: string;
};

const MANAGE = ["admin", "team_lead"];

async function manager() {
  const p = await getProfile();
  return p && MANAGE.includes(p.role) ? p : null;
}

export async function createJwOrder(fd: FormData): Promise<ActionResult> {
  const p = await manager();
  if (!p) return { error: "Only Admin / Team Lead can raise job-work orders." };
  const supabase = await createClient();
  const { data: jwNo } = await supabase.rpc("next_jw_no");
  const { data, error } = await supabase
    .from("job_work_orders")
    .insert({
      jw_no: jwNo,
      vendor_id: String(fd.get("vendor_id") ?? "") || null,
      project_id: String(fd.get("project_id") ?? "") || null,
      expected_date: String(fd.get("expected_date") ?? "") || null,
      status: "draft",
      created_by: p.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/job-work");
  return { ok: true, id: data.id };
}

export async function removeJwOrder(fd: FormData): Promise<ActionResult> {
  const p = await manager();
  if (!p) return { error: "Not authorized." };
  const supabase = await createClient();
  const { error } = await supabase.from("job_work_orders").delete().eq("id", String(fd.get("id")));
  if (error) return { error: error.message };
  revalidatePath("/job-work");
  return { ok: true };
}

export async function addJwLine(fd: FormData): Promise<ActionResult> {
  const p = await manager();
  if (!p) return { error: "Not authorized." };
  const jw_order_id = String(fd.get("jw_order_id"));
  const component_id = String(fd.get("component_id") ?? "");
  const raw_lot_id = String(fd.get("raw_lot_id") ?? "") || null;
  if (!component_id) return { error: "Pick a job-work component." };
  if (!raw_lot_id) return { error: "Pick the raw lot to send." };
  const qty_sent = Number(fd.get("qty_sent") ?? 0) || 0;
  if (qty_sent <= 0) return { error: "Enter a quantity to send." };
  const jwRateRaw = String(fd.get("jw_rate") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.from("job_work_lines").insert({
    jw_order_id,
    component_id,
    raw_lot_id,
    qty_sent,
    jw_rate: jwRateRaw === "" ? null : Number(jwRateRaw),
    created_by: p.id,
  });
  if (error) return { error: error.message };
  revalidatePath(`/job-work/${jw_order_id}`);
  return { ok: true };
}

export async function removeJwLine(fd: FormData): Promise<ActionResult> {
  const p = await manager();
  if (!p) return { error: "Not authorized." };
  const jw_order_id = String(fd.get("jw_order_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("job_work_lines").delete().eq("id", String(fd.get("id")));
  if (error) return { error: error.message };
  revalidatePath(`/job-work/${jw_order_id}`);
  return { ok: true };
}

export async function dispatchJwOrder(fd: FormData): Promise<ActionResult> {
  const p = await manager();
  if (!p) return { error: "Not authorized." };
  const id = String(fd.get("id"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dispatch_job_work", { p_order_id: id, p_user_id: p.id });
  if (error) return { error: error.message.replace(/^.*JOB_WORK: /, "") };
  if (data?.error) return { error: data.error };
  revalidatePath(`/job-work/${id}`);
  return { ok: true };
}

export async function receiveJwLine(fd: FormData): Promise<ActionResult> {
  const p = await manager();
  if (!p) return { error: "Not authorized." };
  const jw_order_id = String(fd.get("jw_order_id"));
  const line_id = String(fd.get("line_id"));
  const qty = Number(fd.get("qty") ?? 0) || 0;
  if (qty <= 0) return { error: "Enter a quantity to receive." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receive_job_work", { p_line_id: line_id, p_qty: qty, p_user_id: p.id });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  revalidatePath(`/job-work/${jw_order_id}`);
  return { ok: true };
}

/**
 * Raise job-work order(s) from a project's approved BOM — for every job-work
 * component still short (required minus completed stock minus stock already
 * in flight to a vendor), picks raw lots FIFO (open, untagged or already
 * reserved for this project) up to what's needed, and groups the resulting
 * lines into one draft order per `jw_vendor_id` (mirrors raisePoFromShortfall's
 * one-PO-per-supplier grouping). Never auto-dispatches — the vendor still
 * reviews/dispatches from the JW order itself.
 */
export async function raiseJobWorkFromProject(fd: FormData): Promise<ActionResult> {
  const p = await manager();
  if (!p) return { error: "Only Admin / Team Lead can raise job-work orders." };
  const project_id = String(fd.get("project_id") ?? "");
  if (!project_id) return { error: "Missing project." };
  const supabase = await createClient();

  const { data: bom } = await supabase.from("boms").select("id").eq("project_id", project_id).maybeSingle();
  if (!bom) return { error: "Generate the BOM first." };
  const { data: bomLines } = await supabase.from("bom_lines").select("component_id, required_qty").eq("bom_id", bom.id);
  const required = new Map<string, number>();
  for (const l of bomLines ?? []) {
    if (!l.component_id) continue;
    required.set(l.component_id, (required.get(l.component_id) ?? 0) + Number(l.required_qty ?? 0));
  }
  if (required.size === 0) return { error: "BOM has no lines." };

  const { data: comps } = await supabase
    .from("components")
    .select("id, jw_vendor_id")
    .in("id", [...required.keys()])
    .eq("is_job_work", true);
  if (!comps || comps.length === 0) return { error: "No job-work components in this BOM." };
  const jwCompIds = comps.map((c) => c.id);
  const vendorByComponent = new Map(comps.map((c) => [c.id, c.jw_vendor_id as string | null]));

  const { data: lots } = await supabase
    .from("inventory_lots")
    .select("id, component_id, qty_on_hand, project_id, jw_stage")
    .in("component_id", jwCompIds)
    .in("status", ["open", "issued"])
    .neq("status", "consumed")
    .gt("qty_on_hand", 0)
    .order("created_at");

  // Stock already sent to a vendor for this project, awaiting return — counts toward "covered", not toward "send more".
  const { data: myOrders } = await supabase.from("job_work_orders").select("id").eq("project_id", project_id).in("status", ["sent", "partial"]);
  const myOrderIds = (myOrders ?? []).map((o) => o.id);
  const { data: myLines } = myOrderIds.length
    ? await supabase.from("job_work_lines").select("component_id, qty_sent, qty_returned").in("jw_order_id", myOrderIds)
    : { data: [] };
  const sentOutstanding = new Map<string, number>();
  for (const l of myLines ?? []) {
    if (!l.component_id) continue;
    const out = Number(l.qty_sent ?? 0) - Number(l.qty_returned ?? 0);
    sentOutstanding.set(l.component_id, (sentOutstanding.get(l.component_id) ?? 0) + out);
  }

  const rawLotsByComponent = new Map<string, { id: string; qty_on_hand: number }[]>();
  const completedAvailable = new Map<string, number>();
  for (const l of lots ?? []) {
    if (!l.component_id) continue;
    if (l.project_id && l.project_id !== project_id) continue; // reserved for another project
    if (l.jw_stage === "raw") {
      const group = rawLotsByComponent.get(l.component_id) ?? [];
      group.push({ id: l.id, qty_on_hand: Number(l.qty_on_hand ?? 0) });
      rawLotsByComponent.set(l.component_id, group);
    } else if (l.jw_stage === "completed") {
      completedAvailable.set(l.component_id, (completedAvailable.get(l.component_id) ?? 0) + Number(l.qty_on_hand ?? 0));
    }
  }

  const linesByVendor = new Map<string | null, { component_id: string; raw_lot_id: string; qty_sent: number }[]>();
  for (const cid of jwCompIds) {
    let remaining = (required.get(cid) ?? 0) - (completedAvailable.get(cid) ?? 0) - (sentOutstanding.get(cid) ?? 0);
    if (remaining <= 0) continue;
    const vendorId = vendorByComponent.get(cid) ?? null;
    for (const lot of rawLotsByComponent.get(cid) ?? []) {
      if (remaining <= 0) break;
      const take = Math.min(lot.qty_on_hand, remaining);
      if (take <= 0) continue;
      const group = linesByVendor.get(vendorId) ?? [];
      group.push({ component_id: cid, raw_lot_id: lot.id, qty_sent: take });
      linesByVendor.set(vendorId, group);
      remaining -= take;
    }
  }

  if (linesByVendor.size === 0) {
    return { error: "No raw stock available to send for job work — any remaining shortfall needs a PO, not job work." };
  }

  const vendorIds = [...linesByVendor.keys()].filter((v): v is string => v !== null);
  const { data: vendors } = vendorIds.length ? await supabase.from("vendors").select("id, name").in("id", vendorIds) : { data: [] };
  const vendorName = new Map((vendors ?? []).map((v) => [v.id, v.name as string]));

  const created: { id: string; jw_no: string; vendor_name: string | null }[] = [];
  for (const [vendorId, lines] of linesByVendor) {
    const { data: jwNo } = await supabase.rpc("next_jw_no");
    const { data: order, error } = await supabase
      .from("job_work_orders")
      .insert({ jw_no: jwNo, vendor_id: vendorId, project_id, status: "draft", created_by: p.id })
      .select("id")
      .single();
    if (error) return { error: error.message };
    const jwLines = lines.map((l) => ({
      jw_order_id: order.id, component_id: l.component_id, raw_lot_id: l.raw_lot_id, qty_sent: l.qty_sent, created_by: p.id,
    }));
    const { error: lErr } = await supabase.from("job_work_lines").insert(jwLines);
    if (lErr) return { error: lErr.message };
    created.push({ id: order.id, jw_no: jwNo, vendor_name: vendorId ? vendorName.get(vendorId) ?? null : null });
  }

  revalidatePath("/job-work");
  revalidatePath(`/projects/${project_id}`);
  if (created.length === 1) return { ok: true, id: created[0].id, created };
  return {
    ok: true,
    created,
    message: `Raised ${created.length} job-work order(s) — one per vendor: ${created.map((c) => c.vendor_name ?? "no vendor tagged").join(", ")}.`,
  };
}
