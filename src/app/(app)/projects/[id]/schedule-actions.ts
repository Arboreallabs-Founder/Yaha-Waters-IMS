"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters } from "@/lib/auth";

export type ActionResult = { ok?: true; error?: string };

const STANDARD_ACTIVITIES = [
  "Document Approval",
  "Material Receive",
  "Machining",
  "Fabrication",
  "Hydro Testing",
  "Blasting & Painting",
  "Assembly",
  "FAT",
  "Dispatch",
];

async function planner() {
  const p = await getProfile();
  return canWriteMasters(p?.role) ? p : null; // admin / team_lead
}

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/schedule");
}

export async function seedStandardActivities(fd: FormData): Promise<ActionResult> {
  const p = await planner();
  if (!p) return { error: "Only Admin / Team Lead can plan the schedule." };
  const project_id = String(fd.get("project_id"));
  const supabase = await createClient();
  const { count } = await supabase
    .from("project_activities")
    .select("*", { count: "exact", head: true })
    .eq("project_id", project_id);
  if ((count ?? 0) > 0) return { error: "This project already has activities." };
  const rows = STANDARD_ACTIVITIES.map((activity, i) => ({
    project_id,
    activity,
    status: "pending",
    sort_order: i + 1,
    created_by: p.id,
  }));
  const { error } = await supabase.from("project_activities").insert(rows);
  if (error) return { error: error.message };
  revalidate(project_id);
  return { ok: true };
}

export async function addActivity(fd: FormData): Promise<ActionResult> {
  const p = await planner();
  if (!p) return { error: "Not authorized." };
  const project_id = String(fd.get("project_id"));
  const activity = String(fd.get("activity") ?? "").trim();
  if (!activity) return { error: "Activity name is required." };
  const supabase = await createClient();
  const sort = Number(fd.get("sort_order") ?? 0) || 99;
  const { error } = await supabase.from("project_activities").insert({
    project_id,
    activity,
    responsibility: String(fd.get("responsibility") ?? "").trim() || null,
    planned_date: String(fd.get("planned_date") ?? "") || null,
    status: "pending",
    sort_order: sort,
    created_by: p.id,
  });
  if (error) return { error: error.message };
  revalidate(project_id);
  return { ok: true };
}

export async function updateActivity(fd: FormData): Promise<ActionResult> {
  const p = await planner();
  if (!p) return { error: "Not authorized." };
  const id = String(fd.get("id"));
  const project_id = String(fd.get("project_id"));
  const num = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v === "" ? null : Number(v);
  };
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_activities")
    .update({
      activity: String(fd.get("activity") ?? "").trim(),
      responsibility: String(fd.get("responsibility") ?? "").trim() || null,
      planned_date: String(fd.get("planned_date") ?? "") || null,
      actual_date: String(fd.get("actual_date") ?? "") || null,
      status: String(fd.get("status") ?? "pending"),
      delay_reason: String(fd.get("delay_reason") ?? "").trim() || null,
      corrective_action: String(fd.get("corrective_action") ?? "").trim() || null,
      sort_order: num("sort_order") ?? 0,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidate(project_id);
  return { ok: true };
}

export async function removeActivity(fd: FormData): Promise<ActionResult> {
  const p = await planner();
  if (!p) return { error: "Not authorized." };
  const project_id = String(fd.get("project_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("project_activities").delete().eq("id", String(fd.get("id")));
  if (error) return { error: error.message };
  revalidate(project_id);
  return { ok: true };
}
