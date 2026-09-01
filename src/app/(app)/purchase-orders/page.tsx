import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canSeeFinancials, canWriteMasters } from "@/lib/auth";
import { getVendors, getComponentsFull, getCustomers } from "@/lib/masters-data";
import { canApprovePoLine } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate, formatNumber, formatINR, cn } from "@/lib/utils";
import { NewPoButton } from "./new-po-button";
import { UntaggedWorklist } from "./untagged-worklist";
import { PoLineApprovalActions } from "./po-line-approval-actions";
import { AllPosTable } from "./all-pos-table";
import { DocumentSignButton } from "@/components/document-sign-button";
import { getPoRegisterRows } from "@/lib/po-register-data";
import { signPo } from "./actions";

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "all" } = await searchParams;
  const profile = await getProfile();
  const finance = canSeeFinancials(profile?.role);
  const canWrite = canWriteMasters(profile?.role); // admin / team_lead
  const supabase = await createClient();

  const [vendorsAll, { data: nextPoNo }, { count: untaggedCount }, { count: pendingApprovalCount }, { count: pendingSignatureCount }, { data: poApproverRight }, { data: mySignatures }] = await Promise.all([
    getVendors(),
    supabase.rpc("peek_next_po_no"),
    supabase.from("po_lines").select("id", { count: "exact", head: true }).is("project_id", null),
    supabase.from("po_lines")
      .select("id, purchase_orders!inner(status)", { count: "exact", head: true })
      .eq("approval_status", "pending_approval")
      .neq("purchase_orders.status", "superseded"),
    supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("status", "pending_signature"),
    supabase.from("approval_rights").select("user_id").eq("document_type", "po").eq("approver_order", 2).maybeSingle(),
    profile ? supabase.from("signatures").select("id, label, method, image_data_url, is_default").eq("user_id", profile.id).order("is_default", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const vendors = vendorsAll.filter((v) => v.is_active);
  const canApprove = canApprovePoLine(profile?.role, profile?.id, poApproverRight?.user_id ?? null);
  const approvalsCount = canApprove ? (pendingApprovalCount ?? 0) + (pendingSignatureCount ?? 0) : 0;

  const TABS = [
    { key: "all", label: "All POs" },
    { key: "untagged", label: `Untagged lines${untaggedCount ? ` (${untaggedCount})` : ""}` },
    { key: "approvals", label: `Approvals${approvalsCount ? ` (${approvalsCount})` : ""}` },
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
        <ApprovalsTab canApprove={canApprove} mySignatures={mySignatures ?? []} />
      ) : (
        <AllPosTab finance={finance} vendors={vendors} />
      )}
    </div>
  );
}

async function AllPosTab({ finance, vendors }: { finance: boolean; vendors: { id: string; name: string }[] }) {
  const supabase = await createClient();
  const [{ data: pos }, poRegisterRows] = await Promise.all([
    supabase.from("purchase_orders").select("*").neq("status", "superseded").order("created_at", { ascending: false }),
    getPoRegisterRows(supabase),
  ]);
  const vName = new Map(vendors.map((v) => [v.id, v.name]));

  // Who's a stuck PO waiting on? Computed in bulk (not per-row) so admins/
  // creators can see this straight from the list without opening each PO.
  const pendingIds = (pos ?? []).filter((po) => po.status === "pending_signature").map((po) => po.id);
  const [{ data: rights }, { data: sigs }] = await Promise.all([
    supabase.from("approval_rights").select("approver_order, user_id").eq("document_type", "po"),
    pendingIds.length
      ? supabase.from("document_signatures").select("document_id, slot").eq("document_type", "po").in("document_id", pendingIds)
      : Promise.resolve({ data: [] }),
  ]);
  const rightsByOrder = new Map((rights ?? []).map((r) => [r.approver_order, r.user_id]));
  const requiredSlots = [...new Set([1, ...(rights ?? []).map((r) => r.approver_order)])].sort((a, b) => a - b);
  const signedSlotsByPo = new Map<string, Set<number>>();
  for (const s of sigs ?? []) {
    if (!signedSlotsByPo.has(s.document_id)) signedSlotsByPo.set(s.document_id, new Set());
    signedSlotsByPo.get(s.document_id)!.add(s.slot);
  }
  const nextSignerIdByPo = new Map<string, string | null>();
  for (const po of pos ?? []) {
    if (po.status !== "pending_signature") continue;
    const signedSlots = signedSlotsByPo.get(po.id) ?? new Set();
    const nextSlot = requiredSlots.find((s) => !signedSlots.has(s)) ?? null;
    nextSignerIdByPo.set(po.id, nextSlot === null ? null : nextSlot === 1 ? po.created_by : rightsByOrder.get(nextSlot) ?? null);
  }
  const signerIds = [...new Set([...nextSignerIdByPo.values()].filter((v): v is string => !!v))];
  const { data: signerProfiles } = signerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", signerIds)
    : { data: [] };
  const signerName = new Map((signerProfiles ?? []).map((p) => [p.id, p.full_name]));

  const rows = (pos ?? []).map((po) => ({
    id: po.id,
    po_no: po.po_no,
    vendor_name: po.vendor_id ? vName.get(po.vendor_id) ?? null : null,
    po_date: po.po_date,
    status: po.status,
    total_amount: po.total_amount,
    waiting_on: po.status === "pending_signature" ? signerName.get(nextSignerIdByPo.get(po.id) ?? "") ?? null : null,
  }));

  return <AllPosTable pos={rows} finance={finance} poRegisterRows={poRegisterRows} />;
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

type MySig = { id: string; label: string | null; method: string; image_data_url: string; is_default: boolean };

async function ApprovalsTab({ canApprove, mySignatures }: { canApprove: boolean; mySignatures: MySig[] }) {
  const supabase = await createClient();

  const { data: awaitingSignature } = canApprove
    ? await supabase.from("purchase_orders").select("id, po_no, vendor_id, created_at").eq("status", "pending_signature").order("created_at", { ascending: true })
    : { data: [] };
  const sigVendorIds = [...new Set((awaitingSignature ?? []).map((po) => po.vendor_id).filter((v): v is string => !!v))];
  const { data: sigVendors } = sigVendorIds.length
    ? await supabase.from("vendors").select("id, name").in("id", sigVendorIds)
    : { data: [] };
  const sigVendorName = new Map((sigVendors ?? []).map((v) => [v.id, v.name]));

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
    return <p className="py-8 text-center text-muted-foreground">Only the configured PO approver (or Admin, if none is configured) can review this.</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Awaiting your signature</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Sent to you</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(awaitingSignature ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nothing awaiting your signature.</TableCell></TableRow>
            ) : (
              (awaitingSignature ?? []).map((po) => (
                <TableRow key={po.id}>
                  <TableCell>
                    <Link href={`/purchase-orders/${po.id}`} className="text-primary hover:underline">{po.po_no}</Link>
                  </TableCell>
                  <TableCell>{po.vendor_id ? sigVendorName.get(po.vendor_id) ?? "—" : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(po.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <DocumentSignButton documentId={po.id} signatures={mySignatures} signAction={signPo} label="Sign" description="Your signature is required to send this PO." />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pending price approval</h2>
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
                  <TableCell className="text-right"><PoLineApprovalActions lineId={l.id} signatures={mySignatures} /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
