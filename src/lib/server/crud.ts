import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters } from "@/lib/auth";

export type ParseType = "string" | "number" | "boolean";
export type ActionResult = { ok?: true; error?: string; redirect?: string };

/**
 * Generic upsert for master tables. Parses FormData by field spec, enforces
 * master-write role, and inserts or updates depending on presence of `id`.
 */
export async function upsertRecord(
  table: string,
  fields: Record<string, ParseType>,
  fd: FormData,
): Promise<ActionResult> {
  const profile = await getProfile();
  if (!canWriteMasters(profile?.role)) return { error: "You don't have permission to edit master data." };

  const supabase = await createClient();
  const id = fd.get("id");
  const payload: Record<string, unknown> = {};

  for (const [name, parse] of Object.entries(fields)) {
    if (parse === "boolean") {
      const v = fd.get(name);
      payload[name] = v !== null && v !== "false" && v !== "off";
      continue;
    }
    const raw = fd.get(name);
    if (raw === null) continue;
    const s = String(raw).trim();
    if (parse === "number") payload[name] = s === "" ? null : Number(s);
    else payload[name] = s === "" ? null : s;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = supabase.from(table as any) as any;
  let resp;
  if (id) {
    resp = await tbl.update(payload).eq("id", String(id));
  } else {
    payload.created_by = profile!.id;
    resp = await tbl.insert(payload);
  }
  if (resp.error) return { error: friendlyError(resp.error.message, resp.error.code) };
  return { ok: true };
}

/**
 * Upsert with a pre-built payload (for tables with JSONB / computed fields that
 * the generic FormData parser can't handle, e.g. variant params, BOM template lines).
 */
export async function upsertRaw(
  table: string,
  payload: Record<string, unknown>,
  id?: string | null,
): Promise<ActionResult> {
  const profile = await getProfile();
  if (!canWriteMasters(profile?.role)) return { error: "You don't have permission to edit master data." };
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = supabase.from(table as any) as any;
  let resp;
  if (id) resp = await tbl.update(payload).eq("id", id);
  else resp = await tbl.insert({ ...payload, created_by: profile!.id });
  if (resp.error) return { error: friendlyError(resp.error.message, resp.error.code) };
  return { ok: true };
}

/** Parse a free-text options string into a JSONB-ready array (JSON or comma list). */
export function parseOptions(raw: string): unknown {
  const s = raw.trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((v) => (v !== "" && !Number.isNaN(Number(v)) ? Number(v) : v));
  }
}

export async function deleteRecord(table: string, fd: FormData): Promise<ActionResult> {
  const profile = await getProfile();
  if (!canWriteMasters(profile?.role)) return { error: "You don't have permission to delete master data." };
  const id = fd.get("id");
  if (!id) return { error: "Missing id." };
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp = await (supabase.from(table as any) as any).delete().eq("id", String(id));
  if (resp.error) return { error: friendlyError(resp.error.message, resp.error.code) };
  return { ok: true };
}

function friendlyError(msg: string, code?: string) {
  if (code === "23505" || msg.includes("duplicate key")) return "A record with that unique value already exists.";
  if (code === "23503" || (msg.includes("foreign key") && msg.includes("still referenced")))
    return "Can't delete — this record is referenced by other data.";
  if (msg.includes("violates row-level security")) return "Not authorized for this action.";
  return msg;
}
