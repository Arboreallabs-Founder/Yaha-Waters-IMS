import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { DownloadExcelButton } from "@/components/download-excel-button";
import { formatDate, formatNumber } from "@/lib/utils";

type Status = "Not Ordered" | "PO Raised" | "Received" | "Consumed";

function materialStatus(hasPo: boolean, onHand: number, consumed: number, openOrderQty: number): Status {
  if (onHand <= 0 && consumed > 0 && openOrderQty <= 0) return "Consumed";
  if (onHand > 0 || consumed > 0) return "Received";
  if (hasPo) return "PO Raised";
  return "Not Ordered";
}

function stack(lines: string[]) {
  return lines.length ? lines.join("\n") : "—";
}

export default async function ProjectReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: bom }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase.from("boms").select("id, status").eq("project_id", id).maybeSingle(),
  ]);
  if (!project) notFound();

  const [{ data: customer }, { data: bomLines }, { data: shortfall }, { data: poLines }] = await Promise.all([
    project.customer_id ? supabase.from("customers").select("name").eq("id", project.customer_id).single() : Promise.resolve({ data: null }),
    bom ? supabase.from("bom_lines").select("id, component_id, required_qty, source, note").eq("bom_id", bom.id) : Promise.resolve({ data: [] }),
    supabase.from("v_project_shortfall")
      .select("component_id, required_qty, ordered_qty, on_hand, consumed_qty, sent_to_jw_qty, shortfall_qty")
      .eq("project_id", id),
    // Cancelled lines (e.g. superseded by a PO revision) never represent real
    // spend or receipts — excluded here so they don't inflate PO Value/Qty
    // totals or falsely imply "PO Raised" for the accounts/status exports.
    supabase.from("po_lines")
      .select("id, component_id, qty_ordered, rate, amount, qty_received, po_id")
      .eq("project_id", id)
      .neq("line_status", "cancelled"),
  ]);

  const poIds = [...new Set((poLines ?? []).map((p) => p.po_id).filter((v): v is string => !!v))];
  const { data: purchaseOrders } = poIds.length
    ? await supabase.from("purchase_orders").select("id, po_no, po_date, vendor_id").in("id", poIds)
    : { data: [] };
  const poById = new Map((purchaseOrders ?? []).map((p) => [p.id, p]));

  const vendorIds = [...new Set((purchaseOrders ?? []).map((p) => p.vendor_id).filter((v): v is string => !!v))];
  const { data: vendors } = vendorIds.length
    ? await supabase.from("vendors").select("id, name").in("id", vendorIds)
    : { data: [] };
  const vendorNameById = new Map((vendors ?? []).map((v) => [v.id, v.name]));

  // Invoice No. lives on grns, not purchase_orders — reached via grn_lines.po_line_id.
  const poLineIds = (poLines ?? []).map((p) => p.id);
  const { data: grnLines } = poLineIds.length
    ? await supabase.from("grn_lines").select("po_line_id, grn_id").in("po_line_id", poLineIds)
    : { data: [] };
  const grnIds = [...new Set((grnLines ?? []).map((g) => g.grn_id).filter((v): v is string => !!v))];
  const { data: grns } = grnIds.length
    ? await supabase.from("grns").select("id, received_at, invoice_no").in("id", grnIds)
    : { data: [] };
  const grnById = new Map((grns ?? []).map((g) => [g.id, g]));
  const lastGrnDateByPoLine = new Map<string, string>();
  const invoiceNosByPoLine = new Map<string, Set<string>>();
  for (const gl of grnLines ?? []) {
    if (!gl.po_line_id) continue;
    const grn = grnById.get(gl.grn_id);
    if (!grn) continue;
    if (grn.received_at) {
      const existing = lastGrnDateByPoLine.get(gl.po_line_id);
      if (!existing || grn.received_at > existing) lastGrnDateByPoLine.set(gl.po_line_id, grn.received_at);
    }
    if (grn.invoice_no) {
      const set = invoiceNosByPoLine.get(gl.po_line_id) ?? new Set<string>();
      set.add(grn.invoice_no);
      invoiceNosByPoLine.set(gl.po_line_id, set);
    }
  }

  const allComponentIds = [...new Set([
    ...(bomLines ?? []).map((l) => l.component_id),
    ...(shortfall ?? []).map((s) => s.component_id),
    ...(poLines ?? []).map((p) => p.component_id),
  ].filter((v): v is string => !!v))];
  const { data: components } = allComponentIds.length
    ? await supabase.from("components").select("id, component_no, name, uom").in("id", allComponentIds)
    : { data: [] };

  // v_project_shortfall only returns rows for components inside the project's
  // formal BOM tree — but plenty of real procurement (PO-only materials with
  // no BOM line) falls outside that tree entirely. For those, compute on-hand
  // / consumed directly (same source queries project_shortfall() itself uses)
  // so the exports don't silently show 0 for materials that clearly moved.
  const [{ data: onHandLots }, { data: consumedMoves }] = allComponentIds.length
    ? await Promise.all([
        supabase.from("inventory_lots").select("component_id, qty_on_hand, status, project_id")
          .in("component_id", allComponentIds).neq("status", "consumed").gt("qty_on_hand", 0),
        supabase.from("stock_movements").select("component_id, qty, reference_type")
          .in("component_id", allComponentIds).eq("movement_type", "issue").eq("project_id", id),
      ])
    : [{ data: [] }, { data: [] }];
  const fallbackOnHand = new Map<string, number>();
  for (const l of onHandLots ?? []) {
    if (!l.component_id || (l.project_id && l.project_id !== id)) continue;
    fallbackOnHand.set(l.component_id, (fallbackOnHand.get(l.component_id) ?? 0) + Number(l.qty_on_hand ?? 0));
  }
  const fallbackConsumed = new Map<string, number>();
  for (const m of consumedMoves ?? []) {
    if (!m.component_id || m.reference_type === "job_work") continue;
    fallbackConsumed.set(m.component_id, (fallbackConsumed.get(m.component_id) ?? 0) + Number(-m.qty));
  }
  const compById = new Map((components ?? []).map((c) => [c.id, c]));
  const compLabel = (cid: string | null) => {
    const c = cid ? compById.get(cid) : null;
    return c ? `${c.component_no} — ${c.name}` : "—";
  };

  type PoLine = NonNullable<typeof poLines>[number];
  const poLinesByComponent = new Map<string, PoLine[]>();
  for (const pl of poLines ?? []) {
    if (!pl.component_id) continue;
    const group = poLinesByComponent.get(pl.component_id) ?? [];
    group.push(pl);
    poLinesByComponent.set(pl.component_id, group);
  }
  const hasPoByComponent = new Set([...poLinesByComponent.keys()]);

  // ---- 1. Approved BOM ----
  const bomRows = (bomLines ?? [])
    .slice()
    .sort((a, b) => compLabel(a.component_id).localeCompare(compLabel(b.component_id)))
    .map((l, i) => {
      const c = l.component_id ? compById.get(l.component_id) : null;
      return [i + 1, c?.component_no ?? "—", c?.name ?? "—", c?.uom ?? "—", Number(l.required_qty ?? 0), l.source, l.note ?? "—"];
    });
  const bomApproved = bom?.status === "approved";

  // ---- 2. Material status ----
  const statusRows = (shortfall ?? [])
    .slice()
    .sort((a, b) => compLabel(a.component_id).localeCompare(compLabel(b.component_id)))
    .map((s, i) => {
      const c = s.component_id ? compById.get(s.component_id) : null;
      const onHand = Number(s.on_hand ?? 0);
      const consumed = Number(s.consumed_qty ?? 0);
      const ordered = Number(s.ordered_qty ?? 0);
      const hasPo = s.component_id ? hasPoByComponent.has(s.component_id) : false;
      const status = materialStatus(hasPo, onHand, consumed, ordered);
      return [
        i + 1, c?.component_no ?? "—", c?.name ?? "—", c?.uom ?? "—",
        Number(s.required_qty ?? 0), Number(s.shortfall_qty ?? 0), ordered, onHand, consumed,
        Number(s.sent_to_jw_qty ?? 0), status,
      ];
    });

  // ---- 3. Accounts View ----
  const deliveryDays = project.order_date && project.delivery_date
    ? Math.round((new Date(project.delivery_date).getTime() - new Date(project.order_date).getTime()) / 86400000)
    : null;
  const shortfallByComponent = new Map((shortfall ?? []).map((s) => [s.component_id, s]));
  const accountsComponentIds = [...new Set([...(shortfall ?? []).map((s) => s.component_id), ...hasPoByComponent])].filter((v): v is string => !!v);

  const accountsRows = accountsComponentIds
    .slice()
    .sort((a, b) => compLabel(a).localeCompare(compLabel(b)))
    .map((cid, i) => {
      const c = compById.get(cid);
      const lines = poLinesByComponent.get(cid) ?? [];
      const poNoLines: string[] = [], poDateLines: string[] = [], vendorLines: string[] = [], invoiceLines: string[] = [];
      const qtyLines: string[] = [], rateLines: string[] = [], valueLines: string[] = [], recvLines: string[] = [], grnDateLines: string[] = [];
      let totalAmount = 0, totalQtyOrdered = 0, openOrderQty = 0;
      for (const pl of lines) {
        const po = pl.po_id ? poById.get(pl.po_id) : null;
        poNoLines.push(po?.po_no ?? "—");
        poDateLines.push(po?.po_date ? formatDate(po.po_date) : "—");
        vendorLines.push(po?.vendor_id ? vendorNameById.get(po.vendor_id) ?? "—" : "—");
        const invoices = invoiceNosByPoLine.get(pl.id);
        invoiceLines.push(invoices && invoices.size ? [...invoices].join("; ") : "—");
        qtyLines.push(formatNumber(Number(pl.qty_ordered ?? 0)));
        rateLines.push(formatNumber(Number(pl.rate ?? 0)));
        valueLines.push(formatNumber(Number(pl.amount ?? 0)));
        recvLines.push(formatNumber(Number(pl.qty_received ?? 0)));
        grnDateLines.push(lastGrnDateByPoLine.has(pl.id) ? formatDate(lastGrnDateByPoLine.get(pl.id)!) : "—");
        totalAmount += Number(pl.amount ?? 0);
        totalQtyOrdered += Number(pl.qty_ordered ?? 0);
        openOrderQty += Math.max(Number(pl.qty_ordered ?? 0) - Number(pl.qty_received ?? 0), 0);
      }
      // Prefer v_project_shortfall (matches the on-screen panel exactly for
      // BOM-tracked materials); fall back to direct on-hand/consumed sums for
      // materials procured via a project PO but not part of the formal BOM.
      const s = shortfallByComponent.get(cid);
      const onHand = s ? Number(s.on_hand ?? 0) : (fallbackOnHand.get(cid) ?? 0);
      const consumed = s ? Number(s.consumed_qty ?? 0) : (fallbackConsumed.get(cid) ?? 0);
      const totalAvailable = onHand + consumed;
      const weightedAvgRate = totalQtyOrdered > 0 ? totalAmount / totalQtyOrdered : null;
      const stockValue = weightedAvgRate !== null ? onHand * weightedAvgRate : null;
      const status = materialStatus(lines.length > 0, onHand, consumed, openOrderQty);

      return [
        i + 1,
        customer?.name ?? "—",
        project.customer_po_number ?? "—",
        project.order_date ? formatDate(project.order_date) : "—",
        project.delivery_date ? formatDate(project.delivery_date) : "—",
        deliveryDays ?? "—",
        stack(poNoLines),
        stack(poDateLines),
        stack(vendorLines),
        `${c?.component_no ?? "—"} — ${c?.name ?? "—"}`,
        c?.uom ?? "—",
        stack(qtyLines),
        stack(rateLines),
        stack(valueLines),
        stack(recvLines),
        formatNumber(totalAvailable),
        formatNumber(consumed),
        formatNumber(onHand),
        stockValue !== null ? formatNumber(stockValue) : "—",
        stack(grnDateLines),
        status,
        stack(invoiceLines),
        "",
      ];
    });

  return (
    <div>
      <Link href={`/projects/${id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to project
      </Link>
      <PageHeader title={`${project.project_no} — Reports`} description="Downloadable exports for procurement follow-up and accounts reconciliation." />

      <CollapsibleSection id="bom" title="Approved BOM" defaultOpen>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-sm text-muted-foreground">
              {bomApproved ? `${bomRows.length} line(s) from the approved BOM.` : "The BOM must be approved before it can be downloaded — see the Bill of Materials section on the project page."}
            </p>
            <DownloadExcelButton
              label="Download BOM"
              filename={`${project.project_no}-BOM.xlsx`}
              sheetName="BOM"
              headers={["Sr. No.", "Component No.", "Material Description", "UOM", "Required Qty", "Source", "Note"]}
              rows={bomRows}
              disabled={!bomApproved}
              colWidths={[8, 18, 36, 10, 14, 12, 30]}
            />
          </CardContent>
        </Card>
      </CollapsibleSection>

      <CollapsibleSection id="material-status" title="Material Status" defaultOpen>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-sm text-muted-foreground">{statusRows.length} material(s) — required vs. not ordered / on order / on hand / consumed.</p>
            <DownloadExcelButton
              label="Download Material Status"
              filename={`${project.project_no}-Material-Status.xlsx`}
              sheetName="Material Status"
              headers={["Sr. No.", "Component No.", "Material Description", "UOM", "Required Qty", "Not Ordered Qty", "PO Raised Qty", "On Hand Qty", "Consumed Qty", "Sent to Job-Work Qty", "Status"]}
              rows={statusRows}
              colWidths={[8, 18, 36, 10, 12, 14, 12, 12, 12, 16, 14]}
            />
          </CardContent>
        </Card>
      </CollapsibleSection>

      <CollapsibleSection id="accounts-view" title="Accounts View" defaultOpen>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-sm text-muted-foreground">{accountsRows.length} material(s) — procurement and consumption detail for accounts reconciliation.</p>
            <DownloadExcelButton
              label="Download Accounts View"
              filename={`${project.project_no}-Accounts-View.xlsx`}
              sheetName="Accounts View"
              headers={[
                "Sr. No.", "Customer Name", "Project PO No.", "Project PO Date", "Project Delivery Date", "Project Delivery Time (Days)",
                "Purchase PO No.", "Purchase PO Date", "Supplier/Vendor Name", "Material Description", "UOM",
                "PO Qty", "PO Rate", "PO Value", "Received Qty", "Total Available Qty", "Consumed Qty", "Balance Stock",
                "Stock Value", "Last GRN Date", "Material Status", "Invoice No.", "Remarks",
              ]}
              rows={accountsRows}
              colWidths={[6, 20, 16, 14, 16, 12, 18, 14, 20, 36, 8, 10, 10, 12, 12, 14, 12, 12, 12, 14, 14, 14, 20]}
            />
          </CardContent>
        </Card>
      </CollapsibleSection>
    </div>
  );
}
