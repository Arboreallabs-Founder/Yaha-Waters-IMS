import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters } from "@/lib/auth";
import { getVendors } from "@/lib/masters-data";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate, formatNumber, cn } from "@/lib/utils";
import { NewGrnButton } from "./new-grn-button";
import { IrnApprovalActions } from "./irn-approval-actions";

const TABS = [
  { key: "all", label: "All GRNs" },
  { key: "approval", label: "Pending Approval" },
  { key: "register", label: "IRN Register" },
];

export default async function GrnPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; from?: string; to?: string; q?: string }>;
}) {
  const { tab = "all", from = "", to = "", q = "" } = await searchParams;
  const profile = await getProfile();
  const canApprove = canWriteMasters(profile?.role);

  return (
    <div>
      <PageHeader
        title="Goods Receipt"
        description="Receive material at the gate — attach to a project or open PO per line as you go."
        action={tab === "all" ? <NewGrnButton vendors={await activeVendors()} /> : undefined}
      />

      <div className="mb-6 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/grn${t.key === "all" ? "" : `?tab=${t.key}`}`}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "approval" && <ApprovalTab canApprove={canApprove} userId={profile?.id ?? null} />}
      {tab === "register" && <RegisterTab from={from} to={to} q={q} />}
      {tab === "all" && <AllGrnsTab />}
    </div>
  );
}

async function activeVendors() {
  const vendors = await getVendors();
  return vendors.filter((v) => v.is_active).map((v) => ({ id: v.id, name: v.name }));
}

async function AllGrnsTab() {
  const supabase = await createClient();
  const [{ data: grns }, vendors, { data: lines }] = await Promise.all([
    supabase.from("grns").select("*").order("received_at", { ascending: false }),
    activeVendors(),
    supabase.from("grn_lines").select("grn_id"),
  ]);

  const vName = new Map((vendors ?? []).map((v) => [v.id, v.name]));
  const lineCount = new Map<string, number>();
  for (const l of lines ?? []) lineCount.set(l.grn_id, (lineCount.get(l.grn_id) ?? 0) + 1);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>GRN No.</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Vendor</TableHead>
          <TableHead>Challan</TableHead>
          <TableHead>Invoice</TableHead>
          <TableHead>Lines</TableHead>
          <TableHead>Received</TableHead>
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {(grns ?? []).length === 0 ? (
          <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No goods receipts yet.</TableCell></TableRow>
        ) : (
          (grns ?? []).map((g) => (
            <TableRow key={g.id}>
              <TableCell className="font-medium">{g.grn_no}</TableCell>
              <TableCell>
                {g.is_job_work ? (
                  <Badge variant="secondary">Job Work</Badge>
                ) : (
                  <Badge variant="outline">Purchase</Badge>
                )}
              </TableCell>
              <TableCell>{g.vendor_id ? vName.get(g.vendor_id) ?? "—" : <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell className="text-muted-foreground">{g.challan_no ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{g.invoice_no ?? "—"}</TableCell>
              <TableCell>{formatNumber(lineCount.get(g.id) ?? 0)}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(g.received_at)}</TableCell>
              <TableCell className="text-right">
                <Link href={`/grn/${g.id}`} aria-label="Open" className={buttonVariants({ variant: "ghost", size: "icon" })}>
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

async function ApprovalTab({ canApprove, userId }: { canApprove: boolean; userId: string | null }) {
  const supabase = await createClient();
  const [{ data: irns }, { data: mySignatures }] = await Promise.all([
    supabase
      .from("irns")
      .select("id, irn_no, component_id, qty, generated_by, generated_at, grn_id")
      .eq("status", "pending_approval")
      .order("generated_at", { ascending: true }),
    userId
      ? supabase.from("signatures").select("id, label, method, image_data_url, is_default").eq("user_id", userId).order("is_default", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const componentIds = [...new Set((irns ?? []).map((i) => i.component_id))];
  const generatorIds = [...new Set((irns ?? []).map((i) => i.generated_by))];
  const grnIds = [...new Set((irns ?? []).map((i) => i.grn_id))];
  const [{ data: components }, { data: generators }, { data: grns }] = await Promise.all([
    componentIds.length ? supabase.from("components").select("id, component_no, name").in("id", componentIds) : Promise.resolve({ data: [] }),
    generatorIds.length ? supabase.from("profiles").select("id, full_name").in("id", generatorIds) : Promise.resolve({ data: [] }),
    grnIds.length ? supabase.from("grns").select("id, grn_no").in("id", grnIds) : Promise.resolve({ data: [] }),
  ]);
  const compLabel = new Map((components ?? []).map((c) => [c.id, `${c.component_no} — ${c.name}`]));
  const genName = new Map((generators ?? []).map((p) => [p.id, p.full_name]));
  const grnNo = new Map((grns ?? []).map((g) => [g.id, g.grn_no]));

  if (!canApprove) {
    return <p className="py-8 text-center text-muted-foreground">Only Admin / Team Lead can review pending inspections.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>IRN No.</TableHead>
          <TableHead>GRN</TableHead>
          <TableHead>Component</TableHead>
          <TableHead>Qty</TableHead>
          <TableHead>Generated by</TableHead>
          <TableHead>Generated</TableHead>
          <TableHead className="w-40 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(irns ?? []).length === 0 ? (
          <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nothing pending approval.</TableCell></TableRow>
        ) : (
          (irns ?? []).map((i) => (
            <TableRow key={i.id}>
              <TableCell className="font-mono text-xs">{i.irn_no}</TableCell>
              <TableCell>
                <Link href={`/grn/${i.grn_id}`} className="text-primary hover:underline">{grnNo.get(i.grn_id) ?? "—"}</Link>
              </TableCell>
              <TableCell>{i.component_id ? compLabel.get(i.component_id) ?? "—" : "—"}</TableCell>
              <TableCell>{formatNumber(i.qty)}</TableCell>
              <TableCell>{i.generated_by ? genName.get(i.generated_by) ?? "—" : "—"}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(i.generated_at)}</TableCell>
              <TableCell className="text-right"><IrnApprovalActions irnId={i.id} signatures={mySignatures ?? []} /></TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

async function RegisterTab({ from, to, q }: { from: string; to: string; q: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("irns")
    .select("id, irn_no, component_id, qty, status, generated_by, generated_at, approved_by, approved_at, rejection_reason, grn_id")
    .order("generated_at", { ascending: false });
  if (from) query = query.gte("generated_at", from);
  if (to) query = query.lte("generated_at", `${to}T23:59:59`);
  const { data: irns } = await query;

  const componentIds = [...new Set((irns ?? []).map((i) => i.component_id))];
  const peopleIds = [...new Set([...(irns ?? []).map((i) => i.generated_by), ...(irns ?? []).map((i) => i.approved_by)].filter(Boolean))] as string[];
  const grnIds = [...new Set((irns ?? []).map((i) => i.grn_id))];
  const [{ data: components }, { data: people }, { data: grns }] = await Promise.all([
    componentIds.length ? supabase.from("components").select("id, component_no, name").in("id", componentIds) : Promise.resolve({ data: [] }),
    peopleIds.length ? supabase.from("profiles").select("id, full_name").in("id", peopleIds) : Promise.resolve({ data: [] }),
    grnIds.length ? supabase.from("grns").select("id, grn_no").in("id", grnIds) : Promise.resolve({ data: [] }),
  ]);
  const compLabel = new Map((components ?? []).map((c) => [c.id, `${c.component_no} — ${c.name}`]));
  const personName = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const grnNo = new Map((grns ?? []).map((g) => [g.id, g.grn_no]));

  const qLower = q.trim().toLowerCase();
  const rows = (irns ?? []).filter((i) => {
    if (!qLower) return true;
    const label = i.component_id ? compLabel.get(i.component_id) ?? "" : "";
    return i.irn_no.toLowerCase().includes(qLower) || label.toLowerCase().includes(qLower);
  });

  const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
    approved: "success", pending_approval: "warning", rejected: "destructive",
  };

  return (
    <div>
      <form className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-4">
        <input type="hidden" name="tab" value="register" />
        <div className="space-y-1.5">
          <Label>From</Label>
          <Input type="date" name="from" defaultValue={from} />
        </div>
        <div className="space-y-1.5">
          <Label>To</Label>
          <Input type="date" name="to" defaultValue={to} />
        </div>
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <Label>Search (IRN no. / component)</Label>
          <Input name="q" defaultValue={q} placeholder="IRN/26-27/0001 or component name" />
        </div>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>IRN No.</TableHead>
            <TableHead>GRN</TableHead>
            <TableHead>Component</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Generated by</TableHead>
            <TableHead>Approved/Rejected by</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No IRNs match this filter.</TableCell></TableRow>
          ) : (
            rows.map((i) => {
              const isSelfApproved = i.generated_by && i.approved_by && i.generated_by === i.approved_by;
              return (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.irn_no}</TableCell>
                  <TableCell>
                    <Link href={`/grn/${i.grn_id}`} className="text-primary hover:underline">{grnNo.get(i.grn_id) ?? "—"}</Link>
                  </TableCell>
                  <TableCell>{i.component_id ? compLabel.get(i.component_id) ?? "—" : "—"}</TableCell>
                  <TableCell>{formatNumber(i.qty)}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[i.status] ?? "secondary"}>{i.status.replace("_", " ")}</Badge></TableCell>
                  <TableCell>{i.generated_by ? personName.get(i.generated_by) ?? "—" : "—"}</TableCell>
                  <TableCell>
                    {i.approved_by
                      ? `${personName.get(i.approved_by) ?? "—"}${isSelfApproved ? " (auto-approved, self)" : ""}`
                      : "—"}
                    {i.status === "rejected" && i.rejection_reason && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{i.rejection_reason}</p>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
