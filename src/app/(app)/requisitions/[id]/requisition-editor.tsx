"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";
import { addReqLine, removeReqLine, updateReqStatus, issueRequisition, type ActionResult } from "../actions";

type Line = { id: string; component_label: string; qty: number };

const STATUSES: { value: string; label: string }[] = [
  { value: "open",             label: "Open" },
  { value: "partially_issued", label: "Partially issued" },
  { value: "issued",           label: "Issued" },
  { value: "closed",           label: "Closed" },
];

export function RequisitionEditor({
  requisitionId,
  status,
  lines,
  components,
  canProcure,
  canRequest,
}: {
  requisitionId: string;
  status: string;
  lines: Line[];
  components: { id: string; component_no: string; name: string }[];
  canProcure: boolean;
  canRequest: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run(action: (fd: FormData) => Promise<ActionResult>, fd: FormData, onOk?: () => void) {
    setBusy(true);
    setError(null);
    const res = await action(fd);
    setBusy(false);
    if (res?.error) { setError(res.error); return; }
    onOk?.();
    router.refresh();
  }

  async function onAddLine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("requisition_id", requisitionId);
    const form = e.currentTarget;
    await run(addReqLine, fd, () => form.reset());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {canProcure ? (
          <div className="flex items-center gap-2">
            <Label className="shrink-0">Status</Label>
            <Select
              value={status}
              disabled={busy}
              onChange={(e) => {
                const fd = new FormData();
                fd.set("id", requisitionId);
                fd.set("status", e.target.value);
                run(updateReqStatus, fd);
              }}
              className="max-w-[200px]"
            >
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            Status: {STATUSES.find((s) => s.value === status)?.label ?? status}
          </span>
        )}

        {canProcure && status === "open" && lines.length > 0 && (
          <Button
            className="ml-auto"
            disabled={busy}
            onClick={() => {
              const fd = new FormData();
              fd.set("requisition_id", requisitionId);
              run(issueRequisition, fd);
            }}
          >
            <PackageCheck className="size-4" /> Issue from stock
          </Button>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Component</TableHead>
            <TableHead>Qty requested</TableHead>
            {canRequest && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                No lines yet. Add components below.
              </TableCell>
            </TableRow>
          ) : (
            lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.component_label}</TableCell>
                <TableCell>{formatNumber(l.qty)}</TableCell>
                {canRequest && (
                  <TableCell>
                    <Button
                      variant="ghost" size="icon" className="text-destructive" aria-label="Remove"
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("id", l.id);
                        fd.set("requisition_id", requisitionId);
                        run(removeReqLine, fd);
                      }}
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

      {canRequest && (
        <form
          onSubmit={onAddLine}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 p-3"
        >
          <div className="flex-1 min-w-[220px]">
            <Label className="mb-1 block text-xs">Component</Label>
            <Select name="component_id" required>
              <option value="">— select component —</option>
              {components.map((c) => (
                <option key={c.id} value={c.id}>{c.component_no} — {c.name}</option>
              ))}
            </Select>
          </div>
          <div className="w-28">
            <Label className="mb-1 block text-xs">Qty</Label>
            <Input name="qty" type="number" step="any" defaultValue="1" />
          </div>
          <Button type="submit" variant="secondary" disabled={busy}>
            <Plus className="size-4" /> Add
          </Button>
        </form>
      )}
    </div>
  );
}
