"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Cog, Check, Lock, Unlock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";
import type { ActionResult } from "./actions";

type Bom = { id: string; status: "draft" | "approved"; approved_at: string | null } | null;
type BomLine = { id: string; component_label: string; required_qty: number; source: string; note: string | null };
type Component = { id: string; component_no: string; name: string };
type Act = (fd: FormData) => Promise<ActionResult>;

export function BomPanel({
  projectId,
  bom,
  lines,
  components,
  canWrite,
  generateAction,
  approveAction,
  unapproveAction,
  addManualAction,
  removeLineAction,
}: {
  projectId: string;
  bom: Bom;
  lines: BomLine[];
  components: Component[];
  canWrite: boolean;
  generateAction: Act;
  approveAction: Act;
  unapproveAction: Act;
  addManualAction: Act;
  removeLineAction: Act;
}) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const approved = bom?.status === "approved";

  const totalQty = lines.reduce((s, l) => s + Number(l.required_qty || 0), 0);

  async function run(action: Act, extra: Record<string, string>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    const fd = new FormData();
    fd.set("project_id", projectId);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    const res = await action(fd);
    setBusy(false);
    if (res?.error) setErr(res.error);
    else {
      if (res?.message) setMsg(res.message);
      router.refresh();
    }
  }

  async function onAddManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    fd.set("project_id", projectId);
    fd.set("bom_id", bom!.id);
    const res = await addManualAction(fd);
    setBusy(false);
    if (res?.error) setErr(res.error);
    else {
      e.currentTarget.reset();
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {bom ? (
          approved ? (
            <Badge variant="success">Approved</Badge>
          ) : (
            <Badge variant="warning">Draft</Badge>
          )
        ) : (
          <Badge variant="secondary">Not generated</Badge>
        )}
        <span className="text-sm text-muted-foreground">
          {lines.length} line(s) · {formatNumber(totalQty)} total qty
        </span>

        {canWrite && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(generateAction, {}, bom ? "Regenerate BOM from templates? Template lines are rebuilt (manual lines kept; an approved BOM reverts to draft)." : undefined)
              }
            >
              <Cog className="size-4" /> {bom ? "Regenerate" : "Generate BOM"}
            </Button>
            {bom && !approved && (
              <Button disabled={busy || lines.length === 0} onClick={() => run(approveAction, { bom_id: bom.id })}>
                <Check className="size-4" /> Approve
              </Button>
            )}
            {bom && approved && (
              <Button variant="outline" disabled={busy} onClick={() => run(unapproveAction, { bom_id: bom.id })}>
                <Unlock className="size-4" /> Unapprove
              </Button>
            )}
          </div>
        )}
      </div>

      {msg && <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800">{msg}</p>}
      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      {bom && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead>Required Qty</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Note</TableHead>
                {canWrite && !approved && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    No lines yet — click Generate BOM.
                  </TableCell>
                </TableRow>
              ) : (
                lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.component_label}</TableCell>
                    <TableCell>{formatNumber(l.required_qty)}</TableCell>
                    <TableCell>
                      <Badge variant={l.source === "manual" ? "warning" : "secondary"}>{l.source}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{l.note ?? "—"}</TableCell>
                    {canWrite && !approved && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          aria-label="Remove line"
                          onClick={() => run(removeLineAction, { id: l.id })}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {canWrite && !approved && (
            <form onSubmit={onAddManual} className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex-1 min-w-[220px]">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Add manual line — component</label>
                <Select name="component_id" required>
                  <option value="">— component —</option>
                  {components.map((c) => (
                    <option key={c.id} value={c.id}>{c.component_no} — {c.name}</option>
                  ))}
                </Select>
              </div>
              <div className="w-24">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Qty</label>
                <Input name="required_qty" type="number" step="any" defaultValue="1" />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Note</label>
                <Input name="note" placeholder="optional" />
              </div>
              <Button type="submit" variant="secondary" disabled={busy}>
                <Plus className="size-4" /> Add
              </Button>
            </form>
          )}

          {approved && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Lock className="size-4" /> BOM approved{bom.approved_at ? ` on ${new Date(bom.approved_at).toLocaleDateString("en-IN")}` : ""}. Unapprove to edit.
            </p>
          )}
        </>
      )}
    </div>
  );
}
