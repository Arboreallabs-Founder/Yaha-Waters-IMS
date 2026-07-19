"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export type ActionResult = { ok?: true; error?: string; id?: string };

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
