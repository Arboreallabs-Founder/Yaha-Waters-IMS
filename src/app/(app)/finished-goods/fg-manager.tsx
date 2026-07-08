"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { QrCode } from "@/components/qr-code";
import { formatDate } from "@/lib/utils";
import { createFinishedGood, updateFgStatus, type ActionResult } from "./actions";

type Fg = { id: string; serial_no: string; product_label: string; status: string; variant_text: string; created_at: string };
const STATUSES = ["in_production", "ready", "dispatched"];

export function FgManager({
  units,
  products,
  lineItems,
  canWrite,
}: {
  units: Fg[];
  products: { id: string; label: string }[];
  lineItems: { id: string; label: string }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run(action: (fd: FormData) => Promise<ActionResult>, fd: FormData, onOk?: () => void) {
    setBusy(true); setError(null);
    const res = await action(fd);
    setBusy(false);
    if (res?.error) { setError(res.error); return; }
    onOk?.(); router.refresh();
  }

  return (
    <div>
      {canWrite && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => { setError(null); setOpen(true); }}><Plus className="size-4" /> New unit</Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Serial (QR)</TableHead>
            <TableHead>QR</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Variant</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {units.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No finished goods yet.</TableCell></TableRow>
          ) : (
            units.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-mono text-xs">{u.serial_no}</TableCell>
                <TableCell><QrCode value={u.serial_no} size={48} /></TableCell>
                <TableCell className="font-medium">{u.product_label}</TableCell>
                <TableCell className="text-muted-foreground">{u.variant_text || "—"}</TableCell>
                <TableCell>
                  {canWrite ? (
                    <Select value={u.status} disabled={busy} className="max-w-[160px]"
                      onChange={(e) => { const fd = new FormData(); fd.set("id", u.id); fd.set("status", e.target.value); run(updateFgStatus, fd); }}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  ) : u.status}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(u.created_at)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={open} onClose={() => setOpen(false)} title="New finished unit" description="Generates a serial + QR for a completed unit.">
        <form onSubmit={(e) => { e.preventDefault(); run(createFinishedGood, new FormData(e.currentTarget), () => setOpen(false)); }} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <Select name="product_id" required>
              <option value="">— product —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Project line item (optional — copies its variant)</Label>
            <Select name="project_line_item_id" defaultValue="">
              <option value="">— none —</option>
              {lineItems.map((li) => <option key={li.id} value={li.id}>{li.label}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select name="status" defaultValue="in_production">
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
