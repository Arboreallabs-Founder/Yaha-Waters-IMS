"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Send, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";
import { addJwLine, removeJwLine, dispatchJwOrder, receiveJwLine } from "../actions";

export type JwComponent = { id: string; label: string; jw_rate: number | null };
export type RawLot = { id: string; component_id: string; lot_code: string; qty_on_hand: number; unit_cost: number | null };
export type JwLine = {
  id: string; component_label: string; raw_lot_code: string;
  qty_sent: number; qty_returned: number; has_completed: boolean; completed_lot_id: string | null;
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

  // add-line form state
  const [componentId, setComponentId] = React.useState("");
  const [rawLotId, setRawLotId] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [jwRate, setJwRate] = React.useState("");

  const lotsForComp = React.useMemo(
    () => rawLots.filter((l) => l.component_id === componentId),
    [rawLots, componentId],
  );
  const isDraft = status === "draft";
  const canReceive = status === "sent" || status === "partial";

  async function run(fn: () => Promise<{ error?: string }>, key: string) {
    setBusy(key); setError(null);
    const res = await fn();
    setBusy(null);
    if (res?.error) { setError(res.error); return false; }
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

  async function onReceive(lineId: string, value: string) {
    const fd = new FormData();
    fd.set("jw_order_id", orderId); fd.set("line_id", lineId); fd.set("qty", value);
    await run(() => receiveJwLine(fd), `rcv-${lineId}`);
  }

  return (
    <div className="space-y-5">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Add-line (draft only) */}
      {canManage && isDraft && (
        <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
          <div className="min-w-[200px] flex-1">
            <Label className="mb-1 block text-xs">Job-work component</Label>
            <Select value={componentId} onChange={(e) => onPickComponent(e.target.value)} required>
              <option value="">— component —</option>
              {jwComponents.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </div>
          <div className="min-w-[180px] flex-1">
            <Label className="mb-1 block text-xs">Raw lot to send</Label>
            <Select value={rawLotId} onChange={(e) => onPickLot(e.target.value)} required disabled={!componentId}>
              <option value="">{componentId ? (lotsForComp.length ? "— raw lot —" : "no raw stock") : "pick component first"}</option>
              {lotsForComp.map((l) => <option key={l.id} value={l.id}>{l.lot_code} · {formatNumber(l.qty_on_hand)} on hand</option>)}
            </Select>
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
          <Button type="submit" disabled={busy === "add"}><Plus className="size-4" /> Add</Button>
        </form>
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
            {canManage && <TableHead className="w-40 text-right">Action</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 ? (
            <TableRow><TableCell colSpan={canManage ? 6 : 5} className="py-6 text-center text-muted-foreground">No lines yet. Add the raw components to send.</TableCell></TableRow>
          ) : (
            lines.map((l) => {
              const outstanding = l.qty_sent - l.qty_returned;
              return (
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
                  {canManage && (
                    <TableCell className="text-right">
                      {isDraft ? (
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onRemoveLine(l.id)} aria-label="Remove"><Trash2 className="size-4" /></Button>
                      ) : canReceive && outstanding > 0 ? (
                        <ReceiveInline max={outstanding} busy={busy === `rcv-${l.id}`} onReceive={(v) => onReceive(l.id, v)} />
                      ) : (
                        <span className="text-xs text-muted-foreground">done</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Dispatch */}
      {canManage && isDraft && lines.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={onDispatch} disabled={busy === "dispatch"}>
            <Send className="size-4" /> Dispatch to vendor
          </Button>
        </div>
      )}
    </div>
  );
}

function ReceiveInline({ max, busy, onReceive }: { max: number; busy: boolean; onReceive: (v: string) => void }) {
  const [v, setV] = React.useState(String(max));
  return (
    <div className="flex items-center justify-end gap-1">
      <Input type="number" step="any" min="0" max={max} value={v} onChange={(e) => setV(e.target.value)} className="h-8 w-20" aria-label="qty to receive" />
      <Button size="sm" variant="secondary" onClick={() => onReceive(v)} disabled={busy}><PackageCheck className="size-4" /> Receive</Button>
    </div>
  );
}
