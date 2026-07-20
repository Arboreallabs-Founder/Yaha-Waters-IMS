import Link from "next/link";
import { ArrowRight, Hammer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate, formatNumber, projectLabel } from "@/lib/utils";
import { NewJwButton } from "./new-jw-button";

const STATUS_VARIANT: Record<string, "secondary" | "warning" | "success" | "destructive"> = {
  draft: "secondary", sent: "warning", partial: "warning", received: "success", cancelled: "destructive",
};

export default async function JobWorkPage() {
  const profile = await getProfile();
  const canWrite = canWriteMasters(profile?.role); // admin / team_lead
  const supabase = await createClient();

  const [{ data: orders }, { data: vendors }, { data: projects }, { data: rawLots }, { data: comps }, { data: customers }] =
    await Promise.all([
      supabase.from("job_work_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("vendors").select("id, name").eq("is_active", true).order("name"),
      supabase.from("projects").select("id, project_no, customer_id").order("project_no"),
      supabase.from("inventory_lots").select("component_id, qty_on_hand").eq("jw_stage", "raw").eq("status", "open").gt("qty_on_hand", 0),
      supabase.from("components").select("id, component_no, name, jw_vendor_id"),
      supabase.from("customers").select("id, name"),
    ]);

  const vName = new Map((vendors ?? []).map((v) => [v.id, v.name]));
  const compById = new Map((comps ?? []).map((c) => [c.id, c]));
  const custName = new Map((customers ?? []).map((c) => [c.id, c.name]));
  const projectsWithCustomer = (projects ?? []).map((p) => ({ ...p, customer_name: p.customer_id ? custName.get(p.customer_id) ?? null : null }));
  const projLabel = new Map(projectsWithCustomer.map((p) => [p.id, projectLabel(p)]));

  // raw stock awaiting job work, grouped by component
  const awaiting = new Map<string, number>();
  for (const l of rawLots ?? []) awaiting.set(l.component_id, (awaiting.get(l.component_id) ?? 0) + Number(l.qty_on_hand ?? 0));

  return (
    <div>
      <PageHeader
        title="Job Work"
        description="Send raw components to a job-work vendor and receive the finished part back. The completed lot's cost = raw + job-work rate."
        action={canWrite ? <NewJwButton vendors={vendors ?? []} projects={projectsWithCustomer} /> : undefined}
      />

      {awaiting.size > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50/50">
          <CardContent className="p-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-800">
              <Hammer className="size-4" /> Raw stock awaiting job work
            </p>
            <div className="flex flex-wrap gap-2">
              {[...awaiting].map(([cid, qty]) => {
                const c = compById.get(cid);
                return (
                  <span key={cid} className="rounded-md border border-amber-200 bg-white px-2.5 py-1 text-xs">
                    <span className="font-medium">{c ? `${c.component_no} — ${c.name}` : cid}</span>
                    <span className="text-muted-foreground"> · {formatNumber(qty)} raw</span>
                    {c?.jw_vendor_id && <span className="text-muted-foreground"> → {vName.get(c.jw_vendor_id) ?? "—"}</span>}
                  </span>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>JW No.</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead>Expected</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(orders ?? []).length === 0 ? (
            <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No job-work orders yet.</TableCell></TableRow>
          ) : (
            (orders ?? []).map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.jw_no}</TableCell>
                <TableCell>
                  {o.project_id
                    ? <Link href={`/projects/${o.project_id}`} className="text-primary hover:underline">{projLabel.get(o.project_id) ?? "—"}</Link>
                    : <span className="text-muted-foreground">stock</span>}
                </TableCell>
                <TableCell>{o.vendor_id ? vName.get(o.vendor_id) ?? "—" : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(o.sent_date)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(o.expected_date)}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[o.status] ?? "secondary"}>{o.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Link href={`/job-work/${o.id}`} aria-label="Open" className={buttonVariants({ variant: "ghost", size: "icon" })}>
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
