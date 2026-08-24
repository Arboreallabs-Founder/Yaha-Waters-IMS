import { Hammer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters } from "@/lib/auth";
import { getVendors, getComponentsFull, getCustomers } from "@/lib/masters-data";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber, projectLabel } from "@/lib/utils";
import { NewJwButton } from "./new-jw-button";
import { JwOrdersTable } from "./jw-orders-table";

export default async function JobWorkPage() {
  const profile = await getProfile();
  const canWrite = canWriteMasters(profile?.role); // admin / team_lead
  const supabase = await createClient();

  const [{ data: orders }, vendorsAll, { data: projects }, { data: rawLots }, comps, customers] =
    await Promise.all([
      supabase.from("job_work_orders").select("*").neq("status", "superseded").order("created_at", { ascending: false }),
      getVendors(),
      supabase.from("projects").select("id, project_no, customer_id").order("project_no"),
      supabase.from("inventory_lots").select("component_id, qty_on_hand").eq("jw_stage", "raw").eq("status", "open").gt("qty_on_hand", 0),
      getComponentsFull(),
      getCustomers(),
    ]);
  const vendors = vendorsAll.filter((v) => v.is_active);

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

      <JwOrdersTable
        orders={(orders ?? []).map((o) => ({
          id: o.id,
          jw_no: o.jw_no,
          project_id: o.project_id,
          project_label: o.project_id ? projLabel.get(o.project_id) ?? null : null,
          vendor_name: o.vendor_id ? vName.get(o.vendor_id) ?? null : null,
          sent_date: o.sent_date,
          expected_date: o.expected_date,
          status: o.status,
        }))}
      />
    </div>
  );
}
