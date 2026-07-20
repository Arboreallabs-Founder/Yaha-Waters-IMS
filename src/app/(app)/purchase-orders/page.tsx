import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canSeeFinancials, canWriteMasters } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate, formatINR } from "@/lib/utils";
import { NewPoButton } from "./new-po-button";
import { UntaggedWorklist } from "./untagged-worklist";

const STATUS_VARIANT: Record<string, "secondary" | "warning" | "success" | "destructive"> = {
  draft: "secondary",
  sent: "warning",
  partial: "warning",
  completed: "success",
  cancelled: "destructive",
};

export default async function PurchaseOrdersPage() {
  const profile = await getProfile();
  const finance = canSeeFinancials(profile?.role);
  const canWrite = canWriteMasters(profile?.role); // admin / team_lead
  const supabase = await createClient();

  const [{ data: pos }, { data: vendors }, { data: untagged }, { data: components }, { data: projects }, { data: customers }] =
    await Promise.all([
      supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("vendors").select("id, name").eq("is_active", true).order("name"),
      supabase.from("po_lines").select("id, po_id, component_id, qty_ordered").is("project_id", null),
      supabase.from("components").select("id, component_no, name"),
      supabase.from("projects").select("id, project_no, customer_id").order("project_no"),
      supabase.from("customers").select("id, name"),
    ]);
  const vName = new Map((vendors ?? []).map((v) => [v.id, v.name]));
  const poNoById = new Map((pos ?? []).map((po) => [po.id, po.po_no]));
  const compLabel = new Map((components ?? []).map((c) => [c.id, `${c.component_no} — ${c.name}`]));
  const custName = new Map((customers ?? []).map((c) => [c.id, c.name]));
  const projectsWithCustomer = (projects ?? []).map((p) => ({ ...p, customer_name: p.customer_id ? custName.get(p.customer_id) ?? null : null }));
  const untaggedLines = (untagged ?? []).map((l) => ({
    id: l.id,
    po_id: l.po_id,
    po_no: poNoById.get(l.po_id) ?? "—",
    component_label: l.component_id ? compLabel.get(l.component_id) ?? "—" : "—",
    qty_ordered: l.qty_ordered,
  }));

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        description="Orders to vendors. Batched across projects; project tags are back-fillable."
        action={canWrite ? <NewPoButton vendors={vendors ?? []} /> : undefined}
      />
      <UntaggedWorklist lines={untaggedLines} projects={projectsWithCustomer} canWrite={canWrite} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>PO No.</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            {finance && <TableHead>Total</TableHead>}
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(pos ?? []).length === 0 ? (
            <TableRow><TableCell colSpan={finance ? 6 : 5} className="py-8 text-center text-muted-foreground">No purchase orders yet.</TableCell></TableRow>
          ) : (
            (pos ?? []).map((po) => (
              <TableRow key={po.id}>
                <TableCell className="font-medium">{po.po_no}</TableCell>
                <TableCell>{po.vendor_id ? vName.get(po.vendor_id) ?? "—" : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(po.po_date)}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[po.status] ?? "secondary"}>{po.status}</Badge></TableCell>
                {finance && <TableCell>{formatINR(po.total_amount)}</TableCell>}
                <TableCell className="text-right">
                  <Link href={`/purchase-orders/${po.id}`} aria-label="Open" className={buttonVariants({ variant: "ghost", size: "icon" })}>
                    <ArrowRight className="size-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
