"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { SearchInput } from "@/components/ui/search-input";
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
  const [query, setQuery] = React.useState("");
  const productItems = React.useMemo(() => products.map((p) => ({ value: p.id, label: p.label })), [products]);
  const lineItemItems = React.useMemo(() => lineItems.map((li) => ({ value: li.id, label: li.label })), [lineItems]);
  const filteredUnits = units.filter((u) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return u.serial_no.toLowerCase().includes(q) || u.product_label.toLowerCase().includes(q);
  });

  async function run(action: (fd: FormData) => Promise<ActionResult>, fd: FormData, onOk?: () => void) {
    setBusy(true); setError(null);
    const res = await action(fd);
    setBusy(false);
    if (res?.error) { setError(res.error); return; }
    onOk?.(); router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search serial no. or product…" />
        <p className="text-sm text-muted-foreground">{filteredUnits.length} of {units.length}</p>
        {canWrite && (
          <Button className="ml-auto" onClick={() => { setError(null); setOpen(true); }}><Plus className="size-4" /> New unit</Button>
        )}
      </div>
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
          {filteredUnits.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{units.length === 0 ? "No finished goods yet." : "No matches."}</TableCell></TableRow>
          ) : (
            filteredUnits.map((u) => (
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
            <Combobox items={productItems} defaultValue="" name="product_id" placeholder="— product —" required />
          </div>
          <div className="space-y-1.5">
            <Label>Project line item (optional — copies its variant)</Label>
            <Combobox items={lineItemItems} defaultValue="" name="project_line_item_id" placeholder="— none —" />
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
