import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import type { Role } from "@/lib/roles";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

// Re-export client-safe helpers so server code can import from one place.
export { ROLE_LABELS, FINANCE_ROLES, canSeeFinancials, canWriteMasters } from "@/lib/roles";
export type { Role } from "@/lib/roles";

/** Returns the signed-in user's profile, or null. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data ?? null;
}

/** Redirects to /login if not signed in or no profile row exists. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

/** Redirects home if the profile's role is not in `roles`. */
export async function requireRole(roles: Role[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/");
  return profile;
}
