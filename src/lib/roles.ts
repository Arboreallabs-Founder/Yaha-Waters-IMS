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

/**
 * Deleting a purchase order is irreversible — restricted tighter than
 * normal PO management:
 * - Admin or Founder can delete ANY PO — draft, sent, a revision, or an
 *   original that's been revised. They're the escape hatch for cleaning
 *   up mistakes/test data even inside a revision chain.
 * - Team Lead can only delete a `draft` that has never been part of a
 *   revision (`revision_no === 0` and `superseded_by === null`).
 * Mirrors the `po_del` RLS policy exactly (the RLS policy is the real
 * backstop). The two self-referencing FKs (`root_po_id`/`superseded_by`)
 * are `on delete set null`, so deleting a link in a chain cleanly detaches
 * it rather than failing — no orphan-cleanup logic needed here.
 */
export function canDeletePurchaseOrders(
  role: Role | undefined | null,
  po?: { status: string; revision_no: number; superseded_by: string | null } | null,
) {
  if (!role || !po) return false;
  if (role === "admin" || role === "founder") return true;
  if (role === "team_lead") return po.status === "draft" && po.revision_no === 0 && po.superseded_by === null;
  return false;
}

/** Approving a PO line's price is admin-only — team_lead is the role the price gate itself governs. */
export function canApprovePoLine(role: Role | undefined | null) {
  return role === "admin";
}
