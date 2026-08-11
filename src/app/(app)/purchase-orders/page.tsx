import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canSeeFinancials, canWriteMasters } from "@/lib/auth";
import { getVendors, getComponentsFull, getCustomers } from "@/lib/masters-data";
import { canApprovePoLine } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate, formatNumber, formatINR, cn } from "@/lib/utils";
import { NewPoButton } from "./new-po-button";
import { UntaggedWorklist } from "./untagged-worklist";
import { PoLineApprovalActions } from "./po-line-approval-actions";

const STATUS_VARIANT: Record<string, "secondary" | "warning" | "success" | "destructive"> = {
  draft: "secondary",
  sent: "warning",
  partial: "warning",
  completed: "success",
  cancelled: "destructive",
  superseded: "secondary",
};

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "all" } = await searchParams;
  const profile = await getProfile();
  const finance = canSeeFinancials(profile?.role);
  const canWrite = canWriteMasters(profile?.role); // admin / team_lead
  const canApprove = canApprovePoLine(profile?.role); // admin only
  const supabase = await createClient();

  const [vendorsAll, { data: nextPoNo }, { count: untaggedCount }, { count: pendingApprovalCount }] = await Promise.all([
    getVendors(),
    supabase.rpc("peek_next_po_no"),
    supabase.from("po_lines").select("id", { count: "exact", head: true }).is("project_id", null),
    supabase.from("po_lines")
      .select("id, purchase_orders!inner(status)", { count: "exact", head: true })
      .eq("approval_status", "pending_approval")
      .neq("purchase_orders.status", "superseded"),
  ]);
  const vendors = vendorsAll.filter((v) => v.is_active);

  const TABS = [
    { key: "all", label: "All POs" },
    { key: "untagged", label: `Untagged lines${untaggedCount ? ` (${untaggedCount})` : ""}` },
    { key: "approvals", label: `Approvals${pendingApprovalCount ? ` (${pendingApprovalCount})` : ""}` },
  ] as const;

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        description="Orders to vendors. Batched across projects; project tags are back-fillable."
        action={canWrite && tab === "all" ? <NewPoButton vendors={vendors ?? []} defaultPoNo={nextPoNo ?? ""} /> : undefined}
      />

      <div className="mb-6 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/purchase-orders${t.key === "all" ? "" : `?tab=${t.key}`}`}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "untagged" ? (
        <UntaggedTab canWrite={canWrite} />
      ) : tab === "approvals" ? (
        <ApprovalsTab canApprove={canApprove} />
      ) : (
        <AllPosTab finance={finance} vendors={vendors} />
      )}
    </div>
  );
}

async function AllPosTab({ finance, vendors }: { finance: boolean; vendors: { id: string; name: string }[] }) {
  const supabase = await createClient();
  const { data: pos } = await supabase.from("purchase_orders").select("*").neq("status", "superseded").order("created_at", { ascending: false });
  const vName = new Map(vendors.map((v) => [v.id, v.name]));

  return (
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
  );
}

async function UntaggedTab({ canWrite }: { canWrite: boolean }) {
  const supabase = await createClient();
  const [{ data: untagged }, components, { data: projects }, customers] = await Promise.all([
    supabase.from("po_lines").select("id, po_id, component_id, qty_ordered, purchase_orders(po_no)").is("project_id", null),
    getComponentsFull(),
    supabase.from("projects").select("id, project_no, customer_id").order("project_no"),
    getCustomers(),
  ]);
  const compLabel = new Map(components.map((c) => [c.id, `${c.component_no} — ${c.name}`]));
  const custName = new Map(customers.map((c) => [c.id, c.name]));
  const projectsWithCustomer = (projects ?? []).map((p) => ({ ...p, customer_name: p.customer_id ? custName.get(p.customer_id) ?? null : null }));
  const untaggedLines = (untagged ?? []).map((l) => {
    const po = Array.isArray(l.purchase_orders) ? l.purchase_orders[0] : l.purchase_orders;
    return {
      id: l.id,
      po_id: l.po_id,
      po_no: po?.po_no ?? "—",
      component_label: l.component_id ? compLabel.get(l.component_id) ?? "—" : "—",
      qty_ordered: l.qty_ordered,
    };
  });

  return <UntaggedWorklist lines={untaggedLines} projects={projectsWithCustomer} canWrite={canWrite} />;
}

async function ApprovalsTab({ canApprove }: { canApprove: boolean }) {
  const supabase = await createClient();
  const { data: allPending } = await supabase
    .from("po_lines")
    .select("id, po_id, component_id, rate, qty_ordered, created_by, created_at")
    .eq("approval_status", "pending_approval")
    .order("created_at", { ascending: true });

  const poIds = [...new Set((allPending ?? []).map((l) => l.po_id))];
  const { data: pos } = poIds.length
    ? await supabase.from("purchase_orders").select("id, po_no, status").in("id", poIds)
    : { data: [] };
  const poNo = new Map((pos ?? []).map((p) => [p.id, p.po_no]));
  const poStatus = new Map((pos ?? []).map((p) => [p.id, p.status]));

  // A pending line whose PO was superseded belongs to dead history now —
  // it stays pending_approval forever (correctly, for print/audit fidelity)
  // but shouldn't clutter the live worklist.
  const pending = (allPending ?? []).filter((l) => poStatus.get(l.po_id) !== "superseded");

  const componentIds = [...new Set(pending.map((l) => l.component_id).filter((v): v is string => !!v))];
  const raiserIds = [...new Set(pending.map((l) => l.created_by).filter((v): v is string => !!v))];
  const [{ data: components }, { data: raisers }] = await Promise.all([
    componentIds.length ? supabase.from("components").select("id, component_no, name").in("id", componentIds) : Promise.resolve({ data: [] }),
    raiserIds.length ? supabase.from("profiles").select("id, full_name").in("id", raiserIds) : Promise.resolve({ data: [] }),
  ]);
  const compLabel = new Map((components ?? []).map((c) => [c.id, `${c.component_no} — ${c.name}`]));
  const raiserName = new Map((raisers ?? []).map((p) => [p.id, p.full_name]));

  if (!canApprove) {
    return <p className="py-8 text-center text-muted-foreground">Only Admin can review pending price approvals.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>PO</TableHead>
          <TableHead>Component</TableHead>
          <TableHead>Qty</TableHead>
          <TableHead>Rate</TableHead>
          <TableHead>Raised by</TableHead>
          <TableHead>Raised</TableHead>
          <TableHead className="w-40 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pending.length === 0 ? (
          <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nothing pending approval.</TableCell></TableRow>
        ) : (
          pending.map((l) => (
            <TableRow key={l.id}>
              <TableCell>
                <Link href={`/purchase-orders/${l.po_id}`} className="text-primary hover:underline">{poNo.get(l.po_id) ?? "—"}</Link>
              </TableCell>
              <TableCell>{l.component_id ? compLabel.get(l.component_id) ?? "—" : "—"}</TableCell>
              <TableCell>{formatNumber(l.qty_ordered)}</TableCell>
              <TableCell>{formatINR(l.rate)}</TableCell>
              <TableCell>{l.created_by ? raiserName.get(l.created_by) ?? "—" : "—"}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(l.created_at)}</TableCell>
              <TableCell className="text-right"><PoLineApprovalActions lineId={l.id} /></TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
