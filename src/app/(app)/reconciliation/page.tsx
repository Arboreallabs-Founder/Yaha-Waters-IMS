import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters, canSeeFinancials, requirePathAccess } from "@/lib/auth";
import { getCustomers, getVendors } from "@/lib/masters-data";
import { HashTabs } from "@/components/hash-tabs";
import { loadShortfallSupply } from "@/lib/server/shortfall-supply";
import { MinStockPanel, type MinStockRow } from "./min-stock-panel";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatNumber, formatDate, projectLabel } from "@/lib/utils";
import { UntaggedGrnTagger } from "./untagged-grn-tagger";
import { readAll } from "@/lib/server/read-all";

export default async function ReconciliationPage() {
  await requirePathAccess("/reconciliation");
  const profile = await getProfile();
  const canWrite = canWriteMasters(profile?.role);
  // Raising POs is Admin / Team Lead (same as everywhere else).
  const canProcure = profile?.role === "admin" || profile?.role === "team_lead";
  const canPrice = canSeeFinancials(profile?.role);
  const supabase = await createClient();

  const [
    { data: variance },
    { data: untagged },
    { data: missingPo },
    { data: stale },
    { data: overdue },
    { data: projects },
    components,
    customers,
    minStock,
    vendorsAll,
    draftGrnsAll,
  ] = await Promise.all([
    supabase.from("v_bom_variance").select("*").or("uncovered_qty.gt.0,receive_gap.gt.0"),
    supabase.from("v_untagged_receipts").select("*").order("received_at", { ascending: false }),
    supabase.from("v_missing_po").select("*"),
    supabase.from("v_stale_stock").select("*").order("age_days", { ascending: false }),
    supabase.from("v_po_overdue").select("*").order("days_overdue", { ascending: false }),
    supabase.from("projects").select("id, project_no, customer_id"),
    readAll((f, t) => supabase.from("components").select("id, component_no, name, raw_supplier_id").order("id").range(f, t)),
    getCustomers(),
    readAll((f, t) => supabase.from("v_min_stock_shortfall").select("*").order("component_no").order("component_id").range(f, t)),
    getVendors(),
    // GRNs started but not sent for over a day.
    readAll((f, t) => supabase.from("grns").select("id, grn_no, vendor_id, challan_no, created_by, created_at")
      .eq("status", "draft").lt("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .order("created_at").order("id").range(f, t)),
  ]);

  // ---- GRN drafts not sent: Admins see everyone's, others their own ----
  const draftGrns = draftGrnsAll.filter((g) => profile?.role === "admin" || g.created_by === profile?.id);
  const draftIds = draftGrns.map((g) => g.id);
  const draftCreatorIds = [...new Set(draftGrns.map((g) => g.created_by).filter((v): v is string => !!v))];
  const [{ data: draftLines }, { data: draftIrns }, { data: draftCreators }] = await Promise.all([
    draftIds.length ? supabase.from("grn_lines").select("grn_id").in("grn_id", draftIds) : Promise.resolve({ data: [] as { grn_id: string }[] }),
    draftIds.length ? supabase.from("irns").select("grn_id").in("grn_id", draftIds).neq("status", "approved") : Promise.resolve({ data: [] as { grn_id: string }[] }),
    draftCreatorIds.length ? supabase.from("profiles").select("id, full_name").in("id", draftCreatorIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);
  const draftItems = new Map<string, number>();
  for (const r of [...(draftLines ?? []), ...(draftIrns ?? [])]) draftItems.set(r.grn_id, (draftItems.get(r.grn_id) ?? 0) + 1);
  const draftCreatorName = new Map((draftCreators ?? []).map((p) => [p.id, p.full_name]));

  // ---- Minimum stock: components below their Master Data minimum ----
  const rawSupplier = new Map((components ?? []).map((c) => [c.id, c.raw_supplier_id]));
  const minSupply = canProcure || canPrice
    ? await loadShortfallSupply(supabase, new Map(minStock.map((r) => [r.component_id!, rawSupplier.get(r.component_id!) ?? null])), canPrice)
    : {};
  const minRows: MinStockRow[] = minStock.map((r) => ({
    component_id: r.component_id!,
    component_label: `${r.component_no} — ${r.component_name}`,
    uom: r.uom,
    is_consumable: !!r.is_consumable,
    min_qty: Number(r.min_qty ?? 0),
    open_qty: Number(r.open_qty ?? 0),
    on_order_qty: Number(r.on_order_qty ?? 0),
    shortfall: Number(r.shortfall_qty ?? 0),
    last_rate: canPrice ? minSupply[r.component_id!]?.latestRate ?? null : null,
  }));
  const activeVendors = vendorsAll.filter((v) => v.is_active);
  const poVendors = activeVendors.map((v) => ({ id: v.id, name: v.name }));
  const consumableVendorIds = activeVendors.filter((v) => (v as { is_consumables_vendor?: boolean }).is_consumables_vendor).map((v) => v.id);

  const custName = new Map(customers.map((c) => [c.id, c.name]));
  const projectsWithCustomer = (projects ?? []).map((p) => ({ ...p, customer_name: p.customer_id ? custName.get(p.customer_id) ?? null : null }));
  const projNo = new Map(projectsWithCustomer.map((p) => [p.id, projectLabel(p)]));
  const compLabel = new Map((components ?? []).map((c) => [c.id, `${c.component_no} — ${c.name}`]));

  const cards = [
    { label: "Below minimum", n: minRows.length, href: "#min-stock" },
    { label: "BOM variance", n: variance?.length ?? 0, href: "#bom-variance" },
    { label: "Untagged receipts", n: untagged?.length ?? 0, href: "#untagged" },
    { label: "Missing PO", n: missingPo?.length ?? 0, href: "#missing-po" },
    { label: "Stale stock", n: stale?.length ?? 0, href: "#stale" },
    { label: "PO overdue", n: overdue?.length ?? 0, href: "#overdue" },
    { label: "GRN drafts", n: draftGrns.length, href: "#grn-drafts" },
  ];

  return (
    <div>
      <PageHeader title="Action Center" description="Live discrepancy checks off the ledger — visible without asking anyone to update Excel." />

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
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

      <HashTabs
        tabs={[
          {
            id: "min-stock",
            label: tabLabel("Minimum stock", minRows.length),
            content: (
              <Check title="Components below their minimum open stock">
                <MinStockPanel
                  rows={minRows}
                  canProcure={canProcure}
                  supply={minSupply}
                  vendors={poVendors}
                  consumableVendorIds={consumableVendorIds}
                  showRates={canPrice}
                />
              </Check>
            ),
          },
          {
            id: "bom-variance",
            label: tabLabel("BOM variance", variance?.length ?? 0),
            content: (
              <Check title="BOM vs Ordered vs Received variance" empty={(variance?.length ?? 0) === 0}>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Project</TableHead><TableHead>Component</TableHead><TableHead>Required</TableHead>
                    <TableHead>Ordered</TableHead><TableHead>Received</TableHead><TableHead>WIP / stock</TableHead>
                    <TableHead>Still to order</TableHead><TableHead>Receive gap</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(variance ?? []).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell><Link href={`/projects/${r.project_id}`} className="text-primary hover:underline">{projNo.get(r.project_id) ?? "—"}</Link></TableCell>
                        <TableCell className="font-medium">{r.component_id ? compLabel.get(r.component_id) ?? "—" : "—"}</TableCell>
                        <TableCell>{formatNumber(r.required_qty)}</TableCell>
                        <TableCell>{formatNumber(r.ordered_qty)}</TableCell>
                        <TableCell>{formatNumber(r.received_qty)}</TableCell>
                        <TableCell className="text-muted-foreground">{formatNumber(Number(r.consumed_qty ?? 0) + Number(r.on_hand_qty ?? 0))}</TableCell>
                        <TableCell>{Number(r.uncovered_qty) > 0 ? <Badge variant="warning">{formatNumber(r.uncovered_qty)}</Badge> : "—"}</TableCell>
                        <TableCell>{Number(r.receive_gap) > 0 ? <Badge variant="secondary">{formatNumber(r.receive_gap)}</Badge> : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Check>
            ),
          },
          {
            id: "untagged",
            label: tabLabel("Untagged receipts", untagged?.length ?? 0),
            content: (
              <Check title="Untagged receipts (received with no PO)" empty={(untagged?.length ?? 0) === 0}>
                <UntaggedGrnTagger
                  rows={(untagged ?? []).map((r) => ({ id: r.grn_line_id, grn_no: r.grn_no, component_label: r.component_name ?? r.component_no ?? "—", qty: r.qty_received, received_at: r.received_at, vendor_name: r.vendor_name }))}
                  projects={projectsWithCustomer}
                  canWrite={canWrite}
                />
              </Check>
            ),
          },
          {
            id: "missing-po",
            label: tabLabel("Missing PO", missingPo?.length ?? 0),
            content: (
              <Check title="Missing PO (BOM demand not ordered and not covered by stock)" empty={(missingPo?.length ?? 0) === 0}>
                <Table>
                  <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Component</TableHead><TableHead>Required</TableHead><TableHead>Received</TableHead><TableHead>WIP / stock</TableHead><TableHead>Still to order</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(missingPo ?? []).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell><Link href={`/projects/${r.project_id}`} className="text-primary hover:underline">{projNo.get(r.project_id) ?? "—"}</Link></TableCell>
                        <TableCell className="font-medium">{r.component_name ?? r.component_no}</TableCell>
                        <TableCell>{formatNumber(r.required_qty)}</TableCell>
                        <TableCell>{formatNumber(r.received_qty)}</TableCell>
                        <TableCell className="text-muted-foreground">{formatNumber(Number(r.consumed_qty ?? 0) + Number(r.on_hand_qty ?? 0))}</TableCell>
                        <TableCell><Badge variant="warning">{formatNumber(r.uncovered_qty)}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Check>
            ),
          },
          {
            id: "stale",
            label: tabLabel("Stale stock", stale?.length ?? 0),
            content: (
              <Check title="Stale stock (available > 60 days)" empty={(stale?.length ?? 0) === 0}>
                <Table>
                  <TableHeader><TableRow><TableHead>Lot</TableHead><TableHead>Component</TableHead><TableHead>On hand</TableHead><TableHead>Age (days)</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(stale ?? []).map((r) => (
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
            ),
          },
          {
            id: "overdue",
            label: tabLabel("PO overdue", overdue?.length ?? 0),
            content: (
              <Check title="PO overdue (open lines past expected date)" empty={(overdue?.length ?? 0) === 0}>
                <Table>
                  <TableHeader><TableRow><TableHead>PO</TableHead><TableHead>Project</TableHead><TableHead>Vendor</TableHead><TableHead>Component</TableHead><TableHead>Expected</TableHead><TableHead>Days overdue</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(overdue ?? []).map((r) => (
                      <TableRow key={r.po_line_id}>
                        <TableCell><Link href={`/purchase-orders/${r.po_id}`} className="text-primary hover:underline">{r.po_no}</Link></TableCell>
                        <TableCell className="text-muted-foreground">{r.project_id ? projNo.get(r.project_id) ?? r.project_no : <span className="italic">stock</span>}</TableCell>
                        <TableCell>{r.vendor_name ?? "—"}</TableCell>
                        <TableCell className="font-medium">{r.component_name ?? r.component_no}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(r.expected_date)}</TableCell>
                        <TableCell><Badge variant="destructive">{r.days_overdue}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Check>
            ),
          },
          {
            id: "grn-drafts",
            label: tabLabel("GRN drafts", draftGrns.length),
            content: (
              <Check title={profile?.role === "admin" ? "GRNs started over a day ago and not sent" : "Your GRNs started over a day ago and not sent"} empty={draftGrns.length === 0}>
                <p className="mb-3 text-xs text-muted-foreground">
                  A draft isn&apos;t waiting on anyone else — its creator adds what came in and presses Sign &amp; Send, or deletes it if it was started by mistake.
                </p>
                <Table>
                  <TableHeader><TableRow><TableHead>GRN</TableHead><TableHead>Vendor</TableHead><TableHead>Challan</TableHead><TableHead>Started by</TableHead><TableHead>Started</TableHead><TableHead>Items</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {draftGrns.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell><Link href={`/grn/${g.id}`} className="text-primary hover:underline">{g.grn_no}</Link></TableCell>
                        <TableCell>{g.vendor_id ? vendorsAll.find((v) => v.id === g.vendor_id)?.name ?? "—" : "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{g.challan_no ?? "—"}</TableCell>
                        <TableCell>{g.created_by ? draftCreatorName.get(g.created_by) ?? "—" : "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(g.created_at)}</TableCell>
                        <TableCell>{(draftItems.get(g.id) ?? 0) === 0 ? <Badge variant="warning">Empty</Badge> : formatNumber(draftItems.get(g.id) ?? 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Check>
            ),
          },
        ]}
      />
    </div>
  );
}

const tabLabel = (label: string, n: number) => `${label} (${n})`;

function Check({ title, empty = false, children }: { title: string; empty?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {empty ? (
        <p className="rounded-lg border border-green-200 bg-green-50/50 px-4 py-3 text-sm text-green-700">✓ All clear.</p>
      ) : (
        children
      )}
    </section>
  );
}
