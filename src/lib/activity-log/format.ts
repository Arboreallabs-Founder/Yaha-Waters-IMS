export type ActivityCategory = "audit" | "stock" | "signature" | "notification";

export type ActivityRow = {
  occurred_at: string;
  actor_id: string | null;
  category: ActivityCategory;
  source_table: string;
  action: string;
  row_id: string | null;
  subject_label: string | null;
  detail: Record<string, unknown> | null;
  link_path: string | null;
};

export type FormattedActivity = { text: string; link: string | null };

const TABLE_LABELS: Record<string, string> = {
  purchase_orders: "PO",
  po_lines: "PO line",
  grns: "GRN",
  grn_lines: "GRN line",
  job_work_orders: "job-work order",
  job_work_lines: "job-work line",
  requisitions: "requisition",
  requisition_lines: "requisition line",
  projects: "project",
  bom_lines: "BOM line",
  profiles: "user account",
  vendors: "vendor",
  customers: "customer",
  components: "component",
  approval_rights: "approval right",
};

const DOC_TYPE_LABELS: Record<string, string> = { po: "PO", grn: "GRN", job_work: "job-work order" };

const MOVEMENT_VERBS: Record<string, string> = {
  issue: "issued",
  receipt: "received",
  adjustment: "adjusted",
  transfer: "transferred",
  return: "returned",
};

function diffKeys(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null): string[] {
  if (!oldData || !newData) return [];
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  keys.delete("updated_at");
  return [...keys].filter((k) => JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]));
}

/** Turns one raw v_activity_log row into a plain-English sentence + optional link. */
export function formatActivity(row: ActivityRow, actorName: string | null): FormattedActivity {
  const actor = actorName ?? "Someone outside the app";
  const link = row.link_path;
  const detail = row.detail ?? {};

  if (row.category === "stock") {
    const movementType = String(detail.movement_type ?? "");
    const verb = MOVEMENT_VERBS[movementType] ?? movementType;
    const qty = Math.abs(Number(detail.qty ?? 0));
    const subject = row.subject_label ?? "a component";
    const referenceType = detail.reference_type ? ` (${detail.reference_type})` : "";
    return { text: `${actor} ${verb} ${qty} of ${subject}${referenceType}`, link };
  }

  if (row.category === "signature") {
    const documentType = String(detail.document_type ?? "");
    const docLabel = DOC_TYPE_LABELS[documentType] ?? documentType;
    const subject = row.subject_label ?? "a deleted document";
    return { text: `${actor} signed ${docLabel} ${subject} (slot ${detail.slot})`, link };
  }

  if (row.category === "notification") {
    return { text: String(detail.message ?? "Notification"), link };
  }

  // category === "audit"
  const tableName = String(detail.table_name ?? row.source_table);
  const tableLabel = TABLE_LABELS[tableName] ?? tableName;
  const subject = row.subject_label ?? row.row_id ?? "a record";
  const oldData = (detail.old_data as Record<string, unknown> | null) ?? null;
  const newData = (detail.new_data as Record<string, unknown> | null) ?? null;

  if (row.action === "insert") {
    return { text: `${actor} created ${tableLabel} ${subject}`, link };
  }
  if (row.action === "delete") {
    return { text: `${actor} deleted ${tableLabel} ${subject}`, link };
  }

  const changed = diffKeys(oldData, newData);

  if (tableName === "purchase_orders" && changed.length === 1 && changed[0] === "status") {
    return { text: `${actor} moved PO ${subject} from ${oldData?.status} to ${newData?.status}`, link };
  }
  if (tableName === "profiles" && changed.includes("role")) {
    return { text: `${actor} changed ${subject}'s role from ${oldData?.role} to ${newData?.role}`, link };
  }
  if (tableName === "profiles" && changed.includes("is_active")) {
    return { text: `${actor} ${newData?.is_active ? "reactivated" : "deactivated"} ${subject}'s account`, link };
  }

  const changedSuffix = changed.length ? ` (changed: ${changed.join(", ")})` : "";
  return { text: `${actor} updated ${tableLabel} ${subject}${changedSuffix}`, link };
}
