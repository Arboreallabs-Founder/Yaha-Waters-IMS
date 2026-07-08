"use server";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import type { Role } from "@/lib/roles";

export type ActionResult = { ok?: true; error?: string };

async function requireAdmin() {
  const profile = await getProfile();
  return profile?.role === "admin" ? profile : null;
}

export async function createUser(fd: FormData): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "Admin only." };
  const supabase = await createClient();
  const body = {
    email: String(fd.get("email") ?? "").trim(),
    password: String(fd.get("password") ?? ""),
    full_name: String(fd.get("full_name") ?? "").trim() || null,
    role: String(fd.get("role") ?? "team_member"),
    team_id: String(fd.get("team_id") ?? "") || null,
  };

  const { data, error } = await supabase.functions.invoke("admin-create-user", { body });
  if (error) {
    let msg = error.message;
    try {
      // FunctionsHttpError hides the body in .context (a Response)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx = (error as any).context;
      const parsed = ctx?.json ? await ctx.json() : null;
      if (parsed?.error) msg = parsed.error;
    } catch {
      /* ignore */
    }
    return { error: msg };
  }
  if (data?.error) return { error: data.error };
  return { ok: true };
}

export async function updateUser(fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Admin only." };
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "Missing id." };
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("profiles") as any)
    .update({
      full_name: String(fd.get("full_name") ?? "").trim() || null,
      role: String(fd.get("role") ?? "team_member") as Role,
      team_id: String(fd.get("team_id") ?? "") || null,
      is_active: fd.get("is_active") !== null,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function createTeam(fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Admin only." };
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { error: "Team name is required." };
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("teams") as any).insert({ name, created_by: admin.id });
  if (error) return { error: error.message.includes("duplicate") ? "That team already exists." : error.message };
  return { ok: true };
}
