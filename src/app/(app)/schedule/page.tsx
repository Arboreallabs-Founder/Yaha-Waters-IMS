import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/utils";

export default async function SchedulePage() {
  const supabase = await createClient();
  const [{ data: schedule }, { data: overdue }] = await Promise.all([
    supabase.from("v_project_schedule").select("*"),
    supabase.from("v_overdue_activities").select("*").order("days_overdue", { ascending: false }),
  ]);

  const withActivities = (schedule ?? []).filter((s) => Number(s.total_activities ?? 0) > 0);

  const now = new Date();
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const inMonth = (d: string | null) => !!d && d >= mStart && d <= mEnd;
  const dispatchThisMonth = (schedule ?? []).filter((s) => inMonth(s.delivery_date) || inMonth(s.dispatch_date));

  return (
    <div>
      <PageHeader title="Production Schedule" description="Planned vs actual across projects, linked to procurement readiness. Prioritise dispatches that invoice this month." />

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Projects</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Overdue</TableHead>
              <TableHead>Next planned</TableHead>
              <TableHead>POs</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>Delivery</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {withActivities.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No project schedules yet. Open a project → Production schedule → “Seed standard activities”.</TableCell></TableRow>
            ) : (
              withActivities.map((s) => (
                <TableRow key={s.project_id}>
                  <TableCell className="font-medium"><Link href={`/projects/${s.project_id}`} className="text-primary hover:underline">{s.project_no}</Link></TableCell>
                  <TableCell>{formatNumber(s.completed_activities)}/{formatNumber(s.total_activities)}</TableCell>
                  <TableCell>{Number(s.overdue_activities) > 0 ? <Badge variant="destructive">{s.overdue_activities}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(s.next_planned_date)}</TableCell>
                  <TableCell>{s.po_released ? <Badge variant="success">released</Badge> : <Badge variant="warning">none</Badge>}</TableCell>
                  <TableCell>{s.material_ready ? <Badge variant="success">ready</Badge> : <Badge variant="warning">short</Badge>}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(s.delivery_date)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Overdue activities</h2>
        {(overdue ?? []).length === 0 ? (
          <p className="rounded-lg border border-green-200 bg-green-50/50 px-4 py-3 text-sm text-green-700">✓ Nothing overdue.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Activity</TableHead><TableHead>Owner</TableHead><TableHead>Planned</TableHead><TableHead>Days overdue</TableHead></TableRow></TableHeader>
            <TableBody>
              {(overdue ?? []).map((a) => (
                <TableRow key={a.activity_id}>
                  <TableCell className="font-medium"><Link href={`/projects/${a.project_id}`} className="text-primary hover:underline">{a.project_no}</Link></TableCell>
                  <TableCell>{a.activity}</TableCell>
                  <TableCell className="text-muted-foreground">{a.responsibility ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(a.planned_date)}</TableCell>
                  <TableCell><Badge variant="destructive">{a.days_overdue}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Dispatchable this month <span className="font-normal normal-case text-muted-foreground">(invoicing focus)</span></h2>
        {dispatchThisMonth.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deliveries/dispatches dated this month.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {dispatchThisMonth.map((s) => (
              <Link key={s.project_id} href={`/projects/${s.project_id}`} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent">
                {s.project_no} <span className="text-muted-foreground">· {formatDate(s.delivery_date ?? s.dispatch_date)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
