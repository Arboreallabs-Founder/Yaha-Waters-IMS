"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Send, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";
import { addJwLine, removeJwLine, updateJwLineRate, dispatchJwOrder, type ActionResult } from "../actions";

const EDITABLE_SENT_STATUSES = ["sent", "partial", "received"];

export type JwComponent = { id: string; label: string; jw_rate: number | null };
export type RawLot = { id: string; component_id: string; lot_code: string; qty_on_hand: number; unit_cost: number | null };
export type JwLine = {
  id: string; component_id: string; component_label: string; raw_lot_code: string;
  qty_sent: number; qty_returned: number; has_completed: boolean; completed_lot_id: string | null;
  grn_id: string | null; grn_no: string | null;
};

export function JwManager({
  orderId, status, lines, jwComponents, rawLots, canManage, finance,
}: {
  orderId: string; status: string; lines: JwLine[];
  jwComponents: JwComponent[]; rawLots: RawLot[]; canManage: boolean; finance: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editingRate, setEditingRate] = React.useState<JwLine | null>(null);
  const [rateInput, setRateInput] = React.useState("");

  // add-line form state
  const [componentId, setComponentId] = React.useState("");
  const [rawLotId, setRawLotId] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [jwRate, setJwRate] = React.useState("");

  const lotsForComp = React.useMemo(
    () => rawLots.filter((l) => l.component_id === componentId),
    [rawLots, componentId],
  );
  const jwComponentItems = React.useMemo(() => jwComponents.map((c) => ({ value: c.id, label: c.label })), [jwComponents]);
  const lotItems = React.useMemo(
    () => lotsForComp.map((l) => ({ value: l.id, label: `${l.lot_code} · ${formatNumber(l.qty_on_hand)} on hand` })),
    [lotsForComp],
  );
  const isDraft = status === "draft";
  const isEditableSent = EDITABLE_SENT_STATUSES.includes(status);
  const canEditLines = canManage && (isDraft || isEditableSent);

  async function run(fn: () => Promise<ActionResult>, key: string) {
    setBusy(key); setError(null);
    const res = await fn();
    setBusy(null);
    if (res?.error) { setError(res.error); return false; }
    if (res?.revisedJwId) { router.push(`/job-work/${res.revisedJwId}`); return true; }
    router.refresh();
    return true;
  }

  function onPickComponent(cid: string) {
    setComponentId(cid);
    setRawLotId("");
    const comp = jwComponents.find((c) => c.id === cid);
    if (comp?.jw_rate != null) setJwRate(String(comp.jw_rate));
  }
  function onPickLot(lid: string) {
    setRawLotId(lid);
    const lot = rawLots.find((l) => l.id === lid);
    if (lot && !qty) setQty(String(lot.qty_on_hand));
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("jw_order_id", orderId);
    fd.set("component_id", componentId);
    fd.set("raw_lot_id", rawLotId);
    fd.set("qty_sent", qty);
    if (jwRate) fd.set("jw_rate", jwRate);
    const ok = await run(() => addJwLine(fd), "add");
    if (ok) { setComponentId(""); setRawLotId(""); setQty(""); setJwRate(""); }
  }

  async function onRemoveLine(id: string) {
    const fd = new FormData();
    fd.set("jw_order_id", orderId); fd.set("id", id);
    await run(() => removeJwLine(fd), `rm-${id}`);
  }

  async function onDispatch() {
    const fd = new FormData();
    fd.set("id", orderId);
    await run(() => dispatchJwOrder(fd), "dispatch");
  }

  async function onSaveRate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRate) return;
    const fd = new FormData();
    fd.set("jw_order_id", orderId);
    fd.set("id", editingRate.id);
    fd.set("jw_rate", rateInput);
    const ok = await run(() => updateJwLineRate(fd), `rate-${editingRate.id}`);
    if (ok) setEditingRate(null);
  }

  return (
    <div className="space-y-5">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Add-line (draft, or sent/partial/received — the latter forks a revision) */}
      {canEditLines && (
        <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
          <div className="min-w-[200px] flex-1">
            <Label className="mb-1 block text-xs">Job-work component</Label>
            <Combobox items={jwComponentItems} value={componentId} onChange={onPickComponent} placeholder="— component —" required />
          </div>
          <div className="min-w-[180px] flex-1">
            <Label className="mb-1 block text-xs">Raw lot to send</Label>
            <Combobox
              items={lotItems}
              value={rawLotId}
              onChange={onPickLot}
              placeholder={componentId ? (lotsForComp.length ? "— raw lot —" : "no raw stock") : "pick component first"}
              required
              disabled={!componentId}
            />
          </div>
          <div className="w-24">
            <Label className="mb-1 block text-xs">Qty to send</Label>
            <Input type="number" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} required />
          </div>
          {finance && (
            <div className="w-28">
              <Label className="mb-1 block text-xs">JW rate ₹/unit</Label>
              <Input type="number" step="any" min="0" value={jwRate} onChange={(e) => setJwRate(e.target.value)} placeholder="component default" />
            </div>
          )}
          <Button type="submit" disabled={busy === "add"}><Plus className="size-4" /> Add{isEditableSent ? " (creates a revision)" : ""}</Button>
        </form>
      )}

      {!isDraft && lines.some((l) => l.qty_sent - l.qty_returned > 0) && (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Receive returned material from <Link href="/grn" className="text-primary hover:underline">Goods Receipt → New GRN → Job Work</Link>.
        </p>
      )}

      {/* Lines */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Component</TableHead>
            <TableHead>Raw lot</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead>Returned</TableHead>
            <TableHead>Completed</TableHead>
            <TableHead>GRN</TableHead>
            {canEditLines && <TableHead className="w-40 text-right">Action</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 ? (
            <TableRow><TableCell colSpan={canEditLines ? 7 : 6} className="py-6 text-center text-muted-foreground">No lines yet. Add the raw components to send.</TableCell></TableRow>
          ) : (
            lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.component_label}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{l.raw_lot_code}</TableCell>
                <TableCell>{formatNumber(l.qty_sent)}</TableCell>
                <TableCell>{formatNumber(l.qty_returned)}</TableCell>
                <TableCell>
                  {l.completed_lot_id ? (
                    <Link href={`/inventory/lots/${l.completed_lot_id}`} className="text-primary hover:underline">completed lot →</Link>
                  ) : l.qty_returned > 0 ? <Badge variant="success">received</Badge> : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  {l.grn_id ? (
                    <Link href={`/grn/${l.grn_id}`} className="text-primary hover:underline">{l.grn_no}</Link>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                {canEditLines && (
                  <TableCell className="text-right">
                    {isEditableSent && finance && (
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => { setError(null); setEditingRate(l); setRateInput(""); }}
                        aria-label="Edit rate"
                      >
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="icon" className="text-destructive"
                      onClick={() => onRemoveLine(l.id)}
                      disabled={isEditableSent && l.qty_returned > 0}
                      title={isEditableSent && l.qty_returned > 0 ? "Can't remove — material already returned against this line" : undefined}
                      aria-label="Remove"
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

      {/* Dispatch (draft only) */}
      {canManage && isDraft && lines.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={onDispatch} disabled={busy === "dispatch"}>
            <Send className="size-4" /> Dispatch to vendor
          </Button>
        </div>
      )}

      {/* Rate-correction dialog (sent/partial/received lines only) */}
      <Dialog open={editingRate !== null} onClose={() => setEditingRate(null)} title="Correct job-work rate" description={editingRate?.component_label}>
        {editingRate && (
          <form onSubmit={onSaveRate} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This creates a revision of the job-work order with the corrected rate on this line — the material itself
              (raw lot / quantity already dispatched) can&apos;t be changed this way.
            </p>
            <div className="space-y-1.5">
              <Label>JW rate ₹/unit</Label>
              <Input type="number" step="any" min="0" value={rateInput} onChange={(e) => setRateInput(e.target.value)} required autoFocus />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditingRate(null)}>Cancel</Button>
              <Button type="submit" disabled={busy === `rate-${editingRate.id}`}>Save (creates a revision)</Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
