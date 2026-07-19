import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRowCard } from "@/components/ui/mobile-row-card";
import { formatDate, formatNumber } from "@/lib/utils";
import { NewRequisitionButton } from "./new-requisition-button";

const STATUS_VARIANT: Record<string, "secondary" | "warning" | "success"> = {
  open: "warning",
  partially_ordered: "warning",
  ordered: "secondary",
  closed: "success",
};

export default async function RequisitionsPage() {
  const supabase = await createClient();
  const [{ data: reqs }, { data: projects }, { data: lines }] = await Promise.all([
    supabase.from("requisitions").select("*").order("created_at", { ascending: false }),
    supabase.from("projects").select("id, project_no").order("project_no"),
    supabase.from("requisition_lines").select("requisition_id"),
  ]);

  const projById = new Map((projects ?? []).map((p) => [p.id, p.project_no]));
  const lineCount = new Map<string, number>();
  for (const l of lines ?? []) lineCount.set(l.requisition_id, (lineCount.get(l.requisition_id) ?? 0) + 1);

  return (
    <div>
      <PageHeader
        title="Requisitions"
        description="Indents — tracked demand, project-tagged or for stock."
        action={<NewRequisitionButton projects={projects ?? []} />}
      />
      {(reqs ?? []).length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">No requisitions yet.</p>
      ) : (
        <>
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Req No.</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Lines</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(reqs ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.req_no}</TableCell>
                    <TableCell>{r.project_id ? projById.get(r.project_id) ?? "—" : <span className="text-muted-foreground">stock</span>}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>{r.status}</Badge></TableCell>
                    <TableCell>{formatNumber(lineCount.get(r.id) ?? 0)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/requisitions/${r.id}`} aria-label="Open" className={buttonVariants({ variant: "ghost", size: "icon" })}>
                        <ArrowRight className="size-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-3 sm:hidden">
            {(reqs ?? []).map((r) => (
              <Link key={r.id} href={`/requisitions/${r.id}`} className="block">
                <MobileRowCard
                  title={r.req_no}
                  subtitle={r.project_id ? projById.get(r.project_id) ?? "—" : "stock"}
                  badge={<Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>{r.status}</Badge>}
                  fields={[
                    { label: "Lines", value: formatNumber(lineCount.get(r.id) ?? 0) },
                    { label: "Created", value: formatDate(r.created_at) },
                  ]}
                />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
