import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canSeeFinancials, canWriteMasters } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PoEditor } from "./po-editor";
import { projectLabel } from "@/lib/utils";

export default async function PoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const finance = canSeeFinancials(profile?.role);
  const canWrite = canWriteMasters(profile?.role);
  const supabase = await createClient();

  const { data: po } = await supabase.from("purchase_orders").select("*").eq("id", id).single();
  if (!po) notFound();

  const [{ data: lines }, { data: components }, { data: vendors }, { data: projects }, { data: vcs }, { data: customers }] =
    await Promise.all([
      supabase.from("po_lines").select("*").eq("po_id", id).order("created_at"),
      supabase.from("components").select("id, component_no, name").order("component_no"),
      supabase.from("vendors").select("id, name").eq("is_active", true).order("name"),
      supabase.from("projects").select("id, project_no, customer_id").order("project_no"),
      supabase.from("vendor_components").select("component_id, price, vendor_id"),
      supabase.from("customers").select("id, name"),
    ]);

  const compLabel = new Map((components ?? []).map((c) => [c.id, `${c.component_no} — ${c.name}`]));
  const vName = new Map((vendors ?? []).map((v) => [v.id, v.name]));
  const custName = new Map((customers ?? []).map((c) => [c.id, c.name]));

  // vendor suggestions per component (who supplies it + price)
  const suggestions: Record<string, { vendor: string; price: number | null }[]> = {};
  for (const vc of vcs ?? []) {
    (suggestions[vc.component_id] ??= []).push({ vendor: vName.get(vc.vendor_id) ?? "—", price: vc.price });
  }

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
  }));

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
            <Link href={`/purchase-orders/${id}/print`} className={buttonVariants({ variant: "outline" })}>
              <Printer className="size-4" /> Print PO
            </Link>
          </div>
        }
      />

      <Card>
        <CardContent className="p-5">
          <PoEditor
            poId={id}
            header={{
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
            canWrite={canWrite}
            canSeeFinancials={finance}
          />
        </CardContent>
      </Card>
    </div>
  );
}
