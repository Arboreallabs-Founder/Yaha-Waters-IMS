import { createClient } from "@/lib/supabase/server";
import { getProfile, canSeeFinancials } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { formatINR } from "@/lib/utils";
import { InventoryTable, type InventoryRow, type BreakdownEntry } from "./inventory-table";

export default async function InventoryPage() {
  const profile = await getProfile();
  const finance = canSeeFinancials(profile?.role);
  const supabase = await createClient();

  const view = finance ? "v_component_on_hand" : "v_component_on_hand_safe";
  const { data } = await supabase.from(view as "v_component_on_hand").select("*");
  const allComponents = (data ?? []).map((r) => ({
    ...r,
    qty_on_hand: Number(r.qty_on_hand ?? 0),
    lot_count: (r as { lot_count?: number }).lot_count ?? 0,
    stock_value: (r as { stock_value?: number }).stock_value ?? null,
    has_stock_history: (r as { has_stock_history?: boolean }).has_stock_history ?? false,
  }));

  const totalValue = finance ? allComponents.reduce((s, r) => s + Number(r.stock_value ?? 0), 0) : null;

  // ---- Vendor / price / PO breakdown per component (for the Excel export) ----
  const { data: lots } = await supabase
    .from("inventory_lots")
    .select("id, component_id, vendor_id, qty_on_hand, qty_initial, unit_cost, grn_line_id")
    .neq("status", "consumed");

  const grnLineIds = [...new Set((lots ?? []).map((l) => l.grn_line_id).filter((v): v is string => !!v))];
  const { data: grnLines } = grnLineIds.length
    ? await supabase.from("grn_lines").select("id, po_line_id").in("id", grnLineIds)
    : { data: [] };
  const poLineIdByGrnLine = new Map((grnLines ?? []).map((g) => [g.id, g.po_line_id]));

  const poLineIds = [...new Set((grnLines ?? []).map((g) => g.po_line_id).filter((v): v is string => !!v))];
  const { data: poLines } = poLineIds.length
    ? await supabase.from("po_lines").select("id, rate, project_id, po_id").in("id", poLineIds)
    : { data: [] };
  const poLineById = new Map((poLines ?? []).map((p) => [p.id, p]));

  const poIds = [...new Set((poLines ?? []).map((p) => p.po_id).filter((v): v is string => !!v))];
  const { data: purchaseOrders } = poIds.length
    ? await supabase.from("purchase_orders").select("id, po_no, po_date, gst_percent").in("id", poIds)
    : { data: [] };
  const poById = new Map((purchaseOrders ?? []).map((p) => [p.id, p]));

  const projectIds = [...new Set((poLines ?? []).map((p) => p.project_id).filter((v): v is string => !!v))];
  const { data: projects } = projectIds.length
    ? await supabase.from("projects").select("id, project_no").in("id", projectIds)
    : { data: [] };
  const projectNoById = new Map((projects ?? []).map((p) => [p.id, p.project_no]));

  const vendorIds = [...new Set((lots ?? []).map((l) => l.vendor_id).filter((v): v is string => !!v))];
  const { data: vendors } = vendorIds.length
    ? await supabase.from("vendors").select("id, name, gst_no, pan, email, website, contact").in("id", vendorIds)
    : { data: [] };
  const vendorById = new Map((vendors ?? []).map((v) => [v.id, v]));

  // Group lots per component into receipt-groups: one entry per distinct po_line
  // (or per distinct vendor+rate for lots with no traceable PO, e.g. site purchases).
  const groupsByComponent = new Map<string, Map<string, { vendorId: string | null; rate: number | null; poLineId: string | null; qtyReceived: number; qtyBalance: number }>>();
  for (const l of lots ?? []) {
    const poLineId = l.grn_line_id ? poLineIdByGrnLine.get(l.grn_line_id) ?? null : null;
    const poLine = poLineId ? poLineById.get(poLineId) : null;
    const rate = poLine?.rate ?? l.unit_cost ?? null;
    const key = poLineId ?? `site:${l.vendor_id ?? "unknown"}:${rate ?? "0"}`;

    let compGroups = groupsByComponent.get(l.component_id);
    if (!compGroups) { compGroups = new Map(); groupsByComponent.set(l.component_id, compGroups); }

    const existing = compGroups.get(key);
    if (existing) {
      existing.qtyReceived += Number(l.qty_initial ?? 0);
      existing.qtyBalance += Number(l.qty_on_hand ?? 0);
    } else {
      compGroups.set(key, {
        vendorId: l.vendor_id,
        rate,
        poLineId,
        qtyReceived: Number(l.qty_initial ?? 0),
        qtyBalance: Number(l.qty_on_hand ?? 0),
      });
    }
  }

  const breakdownByComponent = new Map<string, BreakdownEntry[]>();
  for (const [componentId, compGroups] of groupsByComponent) {
    const entries: BreakdownEntry[] = [...compGroups.values()].map((g) => {
      const vendor = g.vendorId ? vendorById.get(g.vendorId) : null;
      const poLine = g.poLineId ? poLineById.get(g.poLineId) : null;
      const po = poLine?.po_id ? poById.get(poLine.po_id) : null;
      const projectNo = poLine?.project_id ? projectNoById.get(poLine.project_id) ?? null : null;
      return {
        vendorName: vendor?.name ?? "—",
        gstNo: vendor?.gst_no ?? null,
        pan: vendor?.pan ?? null,
        email: vendor?.email ?? null,
        website: vendor?.website ?? null,
        contact: vendor?.contact ?? null,
        rate: g.rate,
        gstPercent: po?.gst_percent ?? null,
        poNo: po?.po_no ?? null,
        poDate: po?.po_date ?? null,
        projectNo,
        qtyReceived: g.qtyReceived,
        qtyBalance: g.qtyBalance,
      };
    });
    breakdownByComponent.set(componentId, entries);
  }

  const onHandRows: InventoryRow[] = allComponents
    .filter((r) => r.qty_on_hand !== 0 || r.has_stock_history)
    .sort((a, b) => b.qty_on_hand - a.qty_on_hand)
    .map((r) => toRow(r, breakdownByComponent));

  const exportRows: InventoryRow[] = [
    ...onHandRows,
    ...allComponents
      .filter((r) => !r.has_stock_history)
      .sort((a, b) => a.component_no.localeCompare(b.component_no))
      .map((r) => toRow(r, breakdownByComponent)),
  ];

  return (
    <div>
      <PageHeader
        title="Inventory — On hand"
        description="Click a component to see its lots and quantities."
      />
      {totalValue !== null && (
        <p className="mb-4 text-sm text-muted-foreground">Total stock value: <span className="font-semibold text-foreground">{formatINR(totalValue)}</span></p>
      )}
      <InventoryTable finance={finance} rows={onHandRows} exportRows={exportRows} />
    </div>
  );
}

function toRow(
  r: { component_id: string; component_no: string; name: string; uom: string | null; qty_on_hand: number; lot_count: number; stock_value: number | null },
  breakdownByComponent: Map<string, BreakdownEntry[]>,
): InventoryRow {
  return {
    component_id: r.component_id,
    component_no: r.component_no,
    name: r.name,
    uom: r.uom,
    qty_on_hand: r.qty_on_hand,
    lot_count: r.lot_count ?? 0,
    stock_value: r.stock_value ?? null,
    breakdown: breakdownByComponent.get(r.component_id) ?? [],
  };
}
