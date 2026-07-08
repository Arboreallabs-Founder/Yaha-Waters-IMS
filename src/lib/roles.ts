import type { Database } from "@/lib/database.types";

// Client-safe role constants & pure helpers (no server-only imports).
export type Role = Database["public"]["Enums"]["role"];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  founder: "Founder",
  team_lead: "Team Lead",
  team_member: "Team Member",
};

/** Roles permitted to see pricing / financial columns. */
export const FINANCE_ROLES: Role[] = ["admin", "founder", "team_lead"];

export function canSeeFinancials(role: Role | undefined | null) {
  return !!role && FINANCE_ROLES.includes(role);
}

export function canWriteMasters(role: Role | undefined | null) {
  return role === "admin" || role === "team_lead";
}
