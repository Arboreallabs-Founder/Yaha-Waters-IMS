"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ListChecks, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { seedStandardActivities, addActivity, updateActivity, removeActivity, type ActionResult } from "./schedule-actions";

export type Activity = {
  id: string;
  activity: string;
  responsibility: string | null;
  planned_date: string | null;
  actual_date: string | null;
  variance_days: number | null;
  status: string;
  delay_reason: string | null;
  corrective_action: string | null;
  sort_order: number;
};
const STATUSES = ["pending", "in_progress", "done", "blocked"];

export function ScheduleEditor({
  projectId,
  activities,
  poReleased,
  materialReady,
  canWrite,
}: {
  projectId: string;
  activities: Activity[];
  poReleased: boolean;
  materialReady: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Activity | null>(null);

  async function run(action: (fd: FormData) => Promise<ActionResult>, fd: FormData, onOk?: () => void) {
    setBusy(true); setError(null);
    fd.set("project_id", projectId);
    const res = await action(fd);
    setBusy(false);
    if (res?.error) { setError(res.error); return; }
    onOk?.(); router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Material readiness banner */}
      <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <Readiness ok={poReleased} label="POs released" />
        <Readiness ok={materialReady} label="Material ready" />
        {!materialReady && (
          <span className="flex items-center gap-1 text-amber-700">
            <AlertTriangle className="size-4" /> Confirm material before scheduling fabrication.
          </span>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {activities.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No schedule yet.</p>
          {canWrite && (
            <Button className="mt-3" onClick={() => run(seedStandardActivities, new FormData())} disabled={busy}>
              <ListChecks className="size-4" /> Seed standard activities
            </Button>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Activity</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Planned</TableHead>
              <TableHead>Actual</TableHead>
              <TableHead>Variance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Delay / action</TableHead>
              {canWrite && <TableHead className="w-20 text-right">Edit</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="text-muted-foreground">{a.sort_order}</TableCell>
                <TableCell className="font-medium">{a.activity}</TableCell>
                <TableCell className="text-muted-foreground">{a.responsibility ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(a.planned_date)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(a.actual_date)}</TableCell>
                <TableCell>
                  {a.variance_days == null ? "—" : (
                    <span className={a.variance_days > 0 ? "text-red-600" : a.variance_days < 0 ? "text-green-700" : "text-muted-foreground"}>
                      {a.variance_days > 0 ? `+${a.variance_days}` : a.variance_days}d
                    </span>
                  )}
                </TableCell>
                <TableCell><Badge variant={a.status === "done" ? "success" : a.status === "blocked" ? "destructive" : "secondary"}>{a.status}</Badge></TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground" title={[a.delay_reason, a.corrective_action].filter(Boolean).join(" → ")}>
                  {a.delay_reason ? `${a.delay_reason}${a.corrective_action ? ` → ${a.corrective_action}` : ""}` : "—"}
                </TableCell>
                {canWrite && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setError(null); setEditing(a); }} aria-label="Edit"><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" aria-label="Remove"
                        onClick={() => { const fd = new FormData(); fd.set("id", a.id); run(removeActivity, fd); }}><Trash2 className="size-4" /></Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canWrite && activities.length > 0 && (
        <form onSubmit={(e) => { e.preventDefault(); const form = e.currentTarget; run(addActivity, new FormData(form), () => form.reset()); }}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex-1 min-w-[180px]"><Label className="mb-1 block text-xs">Add activity</Label><Input name="activity" placeholder="activity name" required /></div>
          <div className="w-36"><Label className="mb-1 block text-xs">Owner</Label><Input name="responsibility" placeholder="e.g. Prem" /></div>
          <div className="w-40"><Label className="mb-1 block text-xs">Planned date</Label><Input name="planned_date" type="date" /></div>
          <div className="w-24"><Label className="mb-1 block text-xs">Order</Label><Input name="sort_order" type="number" defaultValue={String(activities.length + 1)} /></div>
          <Button type="submit" variant="secondary" disabled={busy}><Plus className="size-4" /> Add</Button>
        </form>
      )}

      {/* Edit modal */}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit activity" description={editing?.activity} className="max-w-2xl">
        {editing && (
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("id", editing.id); run(updateActivity, fd, () => setEditing(null)); }} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Activity</Label><Input name="activity" defaultValue={editing.activity} required /></div>
              <div className="space-y-1.5"><Label>Owner</Label><Input name="responsibility" defaultValue={editing.responsibility ?? ""} /></div>
              <div className="space-y-1.5"><Label>Planned date</Label><Input name="planned_date" type="date" defaultValue={editing.planned_date ?? ""} /></div>
              <div className="space-y-1.5"><Label>Actual date</Label><Input name="actual_date" type="date" defaultValue={editing.actual_date ?? ""} /></div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select name="status" defaultValue={editing.status}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
              </div>
              <div className="space-y-1.5"><Label>Sort order</Label><Input name="sort_order" type="number" defaultValue={editing.sort_order} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Delay reason</Label><Input name="delay_reason" defaultValue={editing.delay_reason ?? ""} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Corrective action</Label><Input name="corrective_action" defaultValue={editing.corrective_action ?? ""} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}

function Readiness({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-1.5 ${ok ? "text-green-700" : "text-muted-foreground"}`}>
      {ok ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4 text-amber-600" />}
      {label}: <strong>{ok ? "yes" : "no"}</strong>
    </span>
  );
}
