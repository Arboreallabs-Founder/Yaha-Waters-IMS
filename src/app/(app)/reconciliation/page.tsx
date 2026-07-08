import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatNumber, formatDate, formatINR } from "@/lib/utils";
import { UntaggedGrnTagger } from "./untagged-grn-tagger";

export default async function ReconciliationPage() {
  const profile = await getProfile();
  const canWrite = canWriteMasters(profile?.role);
  const supabase = await createClient();

  const [
    { data: variance },
    { data: untagged },
    { data: missingPo },
    { data: stale },
    { data: overdue },
    { data: invoice },
    { data: projects },
    { data: components },
  ] = await Promise.all([
    supabase.from("v_bom_variance").select("*").or("order_gap.gt.0,receive_gap.gt.0"),
    supabase.from("v_untagged_receipts").select("*").order("received_at", { ascending: false }),
    supabase.from("v_missing_po").select("*"),
    supabase.from("v_stale_stock").select("*").order("age_days", { ascending: false }),
    supabase.from("v_po_overdue").select("*").order("days_overdue", { ascending: false }),
    supabase.from("v_invoice_vs_po").select("*"),
    supabase.from("projects").select("id, project_no"),
    supabase.from("components").select("id, component_no, name"),
  ]);

  const projNo = new Map((projects ?? []).map((p) => [p.id, p.project_no]));
  const compLabel = new Map((components ?? []).map((c) => [c.id, `${c.component_no} — ${c.name}`]));
  const invoiceIssues = (invoice ?? []).filter((r) => Math.abs(Number(r.amount_diff ?? 0)) > 0.01 || (!r.invoice_no && Number(r.total_amount ?? 0) > 0));

  const cards = [
    { label: "BOM variance", n: variance?.length ?? 0, href: "#bom-variance" },
    { label: "Untagged receipts", n: untagged?.length ?? 0, href: "#untagged" },
    { label: "Missing PO", n: missingPo?.length ?? 0, href: "#missing-po" },
    { label: "Stale stock", n: stale?.length ?? 0, href: "#stale" },
    { label: "PO overdue", n: overdue?.length ?? 0, href: "#overdue" },
    { label: "Invoice ≠ PO", n: invoiceIssues.length, href: "#invoice" },
  ];

  return (
    <div>
      <PageHeader title="Action Center" description="Live discrepancy checks off the ledger — visible without asking anyone to update Excel." />

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <a key={c.label} href={c.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
                <p className={`mt-1 text-2xl font-semibold ${c.n > 0 ? "text-amber-600" : "text-green-700"}`}>{c.n}</p>
              </CardContent>
            </Card>
          </a>
        ))}
      </section>

      <Check id="bom-variance" title="BOM vs Ordered vs Received variance" empty={(variance?.length ?? 0) === 0}>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Project</TableHead><TableHead>Component</TableHead><TableHead>Required</TableHead>
            <TableHead>Ordered</TableHead><TableHead>Received</TableHead><TableHead>Order gap</TableHead><TableHead>Receive gap</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(variance ?? []).slice(0, 100).map((r, i) => (
              <TableRow key={i}>
                <TableCell><Link href={`/projects/${r.project_id}`} className="text-primary hover:underline">{projNo.get(r.project_id) ?? "—"}</Link></TableCell>
                <TableCell className="font-medium">{r.component_id ? compLabel.get(r.component_id) ?? "—" : "—"}</TableCell>
                <TableCell>{formatNumber(r.required_qty)}</TableCell>
                <TableCell>{formatNumber(r.ordered_qty)}</TableCell>
                <TableCell>{formatNumber(r.received_qty)}</TableCell>
                <TableCell>{Number(r.order_gap) > 0 ? <Badge variant="warning">{formatNumber(r.order_gap)}</Badge> : "—"}</TableCell>
                <TableCell>{Number(r.receive_gap) > 0 ? <Badge variant="secondary">{formatNumber(r.receive_gap)}</Badge> : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Check>

      <Check id="untagged" title="Untagged receipts (received with no PO)" empty={(untagged?.length ?? 0) === 0}>
        <UntaggedGrnTagger
          rows={(untagged ?? []).map((r) => ({ id: r.grn_line_id, grn_no: r.grn_no, component_label: r.component_name ?? r.component_no ?? "—", qty: r.qty_received, received_at: r.received_at, vendor_name: r.vendor_name }))}
          projects={projects ?? []}
          canWrite={canWrite}
        />
      </Check>

      <Check id="missing-po" title="Missing PO (BOM demand not yet ordered)" empty={(missingPo?.length ?? 0) === 0}>
        <Table>
          <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Component</TableHead><TableHead>Required</TableHead><TableHead>Received</TableHead><TableHead>Gap</TableHead></TableRow></TableHeader>
          <TableBody>
            {(missingPo ?? []).slice(0, 100).map((r, i) => (
              <TableRow key={i}>
                <TableCell><Link href={`/projects/${r.project_id}`} className="text-primary hover:underline">{projNo.get(r.project_id) ?? "—"}</Link></TableCell>
                <TableCell className="font-medium">{r.component_name ?? r.component_no}</TableCell>
                <TableCell>{formatNumber(r.required_qty)}</TableCell>
                <TableCell>{formatNumber(r.received_qty)}</TableCell>
                <TableCell><Badge variant="warning">{formatNumber(r.order_gap)}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Check>

      <Check id="stale" title="Stale stock (available > 60 days)" empty={(stale?.length ?? 0) === 0}>
        <Table>
          <TableHeader><TableRow><TableHead>Lot</TableHead><TableHead>Component</TableHead><TableHead>On hand</TableHead><TableHead>Age (days)</TableHead></TableRow></TableHeader>
          <TableBody>
            {(stale ?? []).slice(0, 100).map((r) => (
              <TableRow key={r.lot_id}>
                <TableCell><Link href={`/inventory/lots/${r.lot_id}`} className="font-mono text-xs text-primary hover:underline">{r.lot_code}</Link></TableCell>
                <TableCell className="font-medium">{r.component_name ?? r.component_no}</TableCell>
                <TableCell>{formatNumber(r.qty_on_hand)}</TableCell>
                <TableCell><Badge variant="secondary">{r.age_days}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Check>

      <Check id="overdue" title="PO overdue (open lines past expected date)" empty={(overdue?.length ?? 0) === 0}>
        <Table>
          <TableHeader><TableRow><TableHead>PO</TableHead><TableHead>Vendor</TableHead><TableHead>Component</TableHead><TableHead>Expected</TableHead><TableHead>Days overdue</TableHead></TableRow></TableHeader>
          <TableBody>
            {(overdue ?? []).slice(0, 100).map((r) => (
              <TableRow key={r.po_line_id}>
                <TableCell><Link href={`/purchase-orders/${r.po_id}`} className="text-primary hover:underline">{r.po_no}</Link></TableCell>
                <TableCell>{r.vendor_name ?? "—"}</TableCell>
                <TableCell className="font-medium">{r.component_name ?? r.component_no}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(r.expected_date)}</TableCell>
                <TableCell><Badge variant="destructive">{r.days_overdue}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Check>

      <Check id="invoice" title="Invoice vs PO mismatch" empty={invoiceIssues.length === 0}>
        <Table>
          <TableHeader><TableRow><TableHead>PO</TableHead><TableHead>Vendor</TableHead><TableHead>Invoice</TableHead><TableHead>PO total</TableHead><TableHead>Lines total</TableHead><TableHead>Diff</TableHead></TableRow></TableHeader>
          <TableBody>
            {invoiceIssues.slice(0, 100).map((r) => (
              <TableRow key={r.po_id}>
                <TableCell><Link href={`/purchase-orders/${r.po_id}`} className="text-primary hover:underline">{r.po_no}</Link></TableCell>
                <TableCell>{r.vendor_name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{r.invoice_no ?? <Badge variant="warning">none</Badge>}</TableCell>
                <TableCell>{formatINR(r.total_amount)}</TableCell>
                <TableCell>{formatINR(r.lines_amount)}</TableCell>
                <TableCell><Badge variant="destructive">{formatINR(r.amount_diff)}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Check>
    </div>
  );
}

function Check({ id, title, empty, children }: { id: string; title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10 scroll-mt-20">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {empty ? (
        <p className="rounded-lg border border-green-200 bg-green-50/50 px-4 py-3 text-sm text-green-700">✓ All clear.</p>
      ) : (
        children
      )}
    </section>
  );
}
