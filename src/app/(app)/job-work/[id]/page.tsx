import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters, canSeeFinancials } from "@/lib/auth";
import { getVendors, getComponentsFull } from "@/lib/masters-data";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { projectLabel } from "@/lib/utils";
import { JwManager, type JwLine, type RawLot, type JwComponent } from "./jw-manager";

const STATUS_VARIANT: Record<string, "secondary" | "warning" | "success" | "destructive"> = {
  draft: "secondary", sent: "warning", partial: "warning", received: "success", cancelled: "destructive",
};

export default async function JobWorkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const canManage = canWriteMasters(profile?.role);
  const finance = canSeeFinancials(profile?.role);
  const supabase = await createClient();

  const [{ data: order }, { data: lines }, componentsAll, { data: lots }, vendorsAll] = await Promise.all([
    supabase.from("job_work_orders").select("*").eq("id", id).single(),
    supabase.from("job_work_lines").select("*").eq("jw_order_id", id).order("created_at"),
    getComponentsFull(),
    supabase.from("inventory_lots").select("id, component_id, lot_code, qty_on_hand, unit_cost").eq("jw_stage", "raw").eq("status", "open").gt("qty_on_hand", 0),
    getVendors(),
  ]);
  if (!order) notFound();
  const comps = componentsAll.filter((c) => c.is_job_work);
  const vendor = order.vendor_id ? vendorsAll.find((v) => v.id === order.vendor_id) ?? null : null;

  const project = order.project_id
    ? await supabase.from("projects").select("project_no, customer_id").eq("id", order.project_id).maybeSingle()
    : { data: null };
  let projectDisplay: string | null = null;
  if (project.data) {
    const { data: cust } = project.data.customer_id
      ? await supabase.from("customers").select("name").eq("id", project.data.customer_id).maybeSingle()
      : { data: null };
    projectDisplay = projectLabel({ project_no: project.data.project_no, customer_name: cust?.name ?? null });
  }

  const compById = new Map((comps ?? []).map((c) => [c.id, c]));
  const lotById = new Map((lots ?? []).map((l) => [l.id, l]));

  const jwComponents: JwComponent[] = (comps ?? []).map((c) => ({
    id: c.id, label: `${c.component_no} — ${c.name}`, jw_rate: finance ? (c.jw_rate ?? null) : null,
  }));
  const committedByLot = new Map<string, number>();
  for (const l of lines ?? []) {
    if (!l.raw_lot_id) continue;
    committedByLot.set(l.raw_lot_id, (committedByLot.get(l.raw_lot_id) ?? 0) + Number(l.qty_sent ?? 0));
  }
  const rawLots: RawLot[] = (lots ?? [])
    .map((l) => ({
      id: l.id, component_id: l.component_id, lot_code: l.lot_code,
      qty_on_hand: Number(l.qty_on_hand ?? 0) - (committedByLot.get(l.id) ?? 0),
      unit_cost: finance ? (l.unit_cost ?? null) : null,
    }))
    .filter((l) => l.qty_on_hand > 0);

  // ---- GRN already received against each line (latest, since a line can be received in batches) ----
  const lineIds = (lines ?? []).map((l) => l.id);
  const { data: jwGrnLines } = lineIds.length
    ? await supabase.from("grn_lines").select("jw_line_id, grn_id, created_at, grns(grn_no)").in("jw_line_id", lineIds).order("created_at", { ascending: false })
    : { data: [] };
  const grnByLine = new Map<string, { id: string; grn_no: string }>();
  for (const gl of jwGrnLines ?? []) {
    if (!gl.jw_line_id || grnByLine.has(gl.jw_line_id)) continue; // first hit per line = latest, due to desc order
    const grnNo = (gl.grns as unknown as { grn_no: string } | null)?.grn_no;
    if (grnNo) grnByLine.set(gl.jw_line_id, { id: gl.grn_id, grn_no: grnNo });
  }

  const lineRows: JwLine[] = (lines ?? []).map((l) => {
    const c = l.component_id ? compById.get(l.component_id) : null;
    const grn = grnByLine.get(l.id);
    return {
    id: l.id,
    component_id: l.component_id ?? "",
    component_label: c ? `${c.component_no} — ${c.name}` : "—",
    raw_lot_code: l.raw_lot_id ? lotById.get(l.raw_lot_id)?.lot_code ?? "(dispatched)" : "—",
    qty_sent: Number(l.qty_sent ?? 0),
    qty_returned: Number(l.qty_returned ?? 0),
    has_completed: !!l.completed_lot_id,
    completed_lot_id: l.completed_lot_id ?? null,
    grn_id: grn?.id ?? null,
    grn_no: grn?.grn_no ?? null,
    };
  });

  return (
    <div>
      <Link href="/job-work" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All job-work orders
      </Link>
      <PageHeader
        title={order.jw_no}
        description={`Job-work vendor: ${vendor?.name ?? "—"} · ${order.project_id ? `Project ${projectDisplay ?? "—"}` : "Stock (no project)"}`}
        action={
          <div className="flex items-center gap-3">
            <Badge variant={STATUS_VARIANT[order.status] ?? "secondary"}>{order.status}</Badge>
            <Link href={`/job-work/${id}/print`} className={buttonVariants({ variant: "outline" })}>
              <Printer className="size-4" /> Print JW
            </Link>
          </div>
        }
      />

      <Card className="mb-6">
        <CardContent className="p-5">
          <JwManager
            orderId={id}
            status={order.status}
            lines={lineRows}
            jwComponents={jwComponents}
            rawLots={rawLots}
            canManage={canManage}
            finance={finance}
          />
        </CardContent>
      </Card>
    </div>
  );
}
