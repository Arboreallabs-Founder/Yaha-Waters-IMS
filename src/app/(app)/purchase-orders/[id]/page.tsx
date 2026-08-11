import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canSeeFinancials, canWriteMasters } from "@/lib/auth";
import { canDeletePurchaseOrders } from "@/lib/roles";
import { getVendors, getComponentsFull, getCustomers } from "@/lib/masters-data";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PoEditor } from "./po-editor";
import { DeletePoButton } from "./delete-po-button";
import { projectLabel, cn } from "@/lib/utils";

export default async function PoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const finance = canSeeFinancials(profile?.role);
  const supabase = await createClient();

  const { data: po } = await supabase.from("purchase_orders").select("*").eq("id", id).single();
  if (!po) notFound();

  // Editable only while draft (in place) or sent (line edits fork a
  // revision) — once GRN receiving has started (partial/completed) or the
  // PO is cancelled/superseded, it's permanently read-only.
  const canWrite = canWriteMasters(profile?.role) && (po.status === "draft" || po.status === "sent");
  const canDelete = canDeletePurchaseOrders(profile?.role, po);

  let currentRevisionId: string | null = null;
  if (po.superseded_by) {
    const rootId = po.root_po_id ?? po.id;
    const { data: lineage } = await supabase
      .from("purchase_orders")
      .select("id, superseded_by")
      .or(`id.eq.${rootId},root_po_id.eq.${rootId}`);
    currentRevisionId = (lineage ?? []).find((r) => r.superseded_by === null)?.id ?? null;
  }

  const [{ data: lines }, components, vendorsAll, { data: projects }, { data: vcs }, customers, { data: lastRates }] =
    await Promise.all([
      supabase.from("po_lines").select("*").eq("po_id", id).order("created_at"),
      getComponentsFull(),
      getVendors(),
      supabase.from("projects").select("id, project_no, customer_id").order("project_no"),
      supabase.from("vendor_components").select("component_id, price, vendor_id"),
      getCustomers(),
      supabase.from("v_last_component_rate").select("component_id, rate"),
    ]);
  const vendors = vendorsAll.filter((v) => v.is_active);
  const lastRateByComponent: Record<string, number> = {};
  for (const r of lastRates ?? []) {
    if (r.component_id && r.rate != null) lastRateByComponent[r.component_id] = Number(r.rate);
  }

  const compLabel = new Map((components ?? []).map((c) => [c.id, `${c.component_no} — ${c.name}${c.is_job_work ? " (raw)" : ""}`]));
  const vName = new Map((vendors ?? []).map((v) => [v.id, v.name]));
  const custName = new Map((customers ?? []).map((c) => [c.id, c.name]));

  // vendor suggestions per component (who supplies it + price)
  const suggestions: Record<string, { vendor: string; price: number | null }[]> = {};
  for (const vc of vcs ?? []) {
    (suggestions[vc.component_id] ??= []).push({ vendor: vName.get(vc.vendor_id) ?? "—", price: vc.price });
  }

  // components tagged to this PO's vendor — narrows the "Add line" picker by default
  const vendorComponentIds = po.vendor_id
    ? [...new Set((vcs ?? []).filter((vc) => vc.vendor_id === po.vendor_id).map((vc) => vc.component_id))]
    : [];

  const lineRows = (lines ?? []).map((l) => ({
    id: l.id,
    component_id: l.component_id,
    component_label: l.component_id ? compLabel.get(l.component_id) ?? "—" : "—",
    project_id: l.project_id,
    qty_ordered: l.qty_ordered,
    rate: l.rate,
    amount: l.amount,
    expected_date: l.expected_date,
    line_status: l.line_status,
    approval_status: l.approval_status,
    rejection_reason: l.rejection_reason,
  }));

  const printable = lineRows.every((l) => l.approval_status === "approved");
  const pendingCount = lineRows.filter((l) => l.approval_status !== "approved").length;

  return (
    <div>
      <Link href="/purchase-orders" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All purchase orders
      </Link>
      <PageHeader
        title={po.po_no}
        description={po.vendor_id ? vName.get(po.vendor_id) ?? undefined : "no vendor yet"}
        action={
          <div className="flex items-center gap-3">
            <Badge variant="secondary">{po.status}</Badge>
            {printable ? (
              <Link href={`/purchase-orders/${id}/print`} className={buttonVariants({ variant: "outline" })}>
                <Printer className="size-4" /> Print PO
              </Link>
            ) : (
              <span
                className={cn(buttonVariants({ variant: "outline" }), "cursor-not-allowed opacity-50")}
                title={`Cannot print — ${pendingCount} line(s) awaiting price approval`}
              >
                <Printer className="size-4" /> Print PO
              </span>
            )}
            {canDelete && <DeletePoButton poId={id} poNo={po.po_no} isRevisioned={po.revision_no > 0 || po.superseded_by !== null} />}
          </div>
        }
      />

      {po.superseded_by && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This PO has been superseded by a newer revision.
          {currentRevisionId && (
            <>
              {" "}
              <Link href={`/purchase-orders/${currentRevisionId}`} className="font-medium underline">
                View current revision
              </Link>
            </>
          )}
        </div>
      )}

      <Card>
        <CardContent className="p-5">
          <PoEditor
            poId={id}
            header={{
              po_no: po.po_no,
              vendor_id: po.vendor_id,
              po_date: po.po_date,
              status: po.status,
              delivery_terms: po.delivery_terms,
              payment_terms: po.payment_terms,
              freight_terms: po.freight_terms,
              gst_percent: Number(po.gst_percent ?? 18),
            }}
            lines={lineRows}
            components={components ?? []}
            vendors={vendors ?? []}
            projects={(projects ?? []).map((p) => ({ id: p.id, label: projectLabel({ project_no: p.project_no, customer_name: p.customer_id ? custName.get(p.customer_id) ?? null : null }) }))}
            suggestions={suggestions}
            lastRateByComponent={lastRateByComponent}
            vendorComponentIds={vendorComponentIds}
            vendorName={po.vendor_id ? vName.get(po.vendor_id) ?? null : null}
            canWrite={canWrite}
            canSeeFinancials={finance}
          />
        </CardContent>
      </Card>
    </div>
  );
}
