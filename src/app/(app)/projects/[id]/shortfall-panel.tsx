"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, PackageCheck, CheckCircle2, AlertTriangle, MinusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";
import { raisePoFromShortfall } from "../../purchase-orders/actions";
import { quickIssueComponent } from "./actions";
import type { ActionResult } from "../../purchase-orders/actions";

type Row = {
  component_id: string;
  component_label: string;
  required: number;
  ordered: number;
  on_hand: number;
  shortfall: number;
};

export function ShortfallPanel({ projectId, rows, canProcure }: { projectId: string; rows: Row[]; canProcure: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<Set<string>>(new Set());

  const hasShortfall = rows.some((r) => r.shortfall > 0);

  async function raisePo() {
    setBusy("po"); setError(null);
    const fd = new FormData();
    fd.set("project_id", projectId);
    const res: ActionResult = await raisePoFromShortfall(fd);
    setBusy(null);
    if (res?.error) { setError(res.error); return; }
    if ((res as { id?: string }).id) router.push(`/purchase-orders/${(res as { id?: string }).id}`);
    else router.refresh();
  }

  async function issueRow(row: Row) {
    const qty = Math.min(row.required, row.on_hand);
    setBusy(row.component_id); setError(null);
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("component_id", row.component_id);
    fd.set("qty", String(qty));
    const res = await quickIssueComponent(fd);
    setBusy(null);
    if (res?.error) { setError(res.error); return; }
    setIssued((s) => new Set([...s, row.component_id]));
    router.refresh();
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Generate the BOM to see the stock-check shortfall.</p>;
  }

  return (
    <div className="space-y-4">
      {canProcure && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            disabled={busy === "po" || !hasShortfall}
            onClick={raisePo}
          >
            <ShoppingCart className="size-4" /> Raise PO for shortfall
          </Button>
        </div>
      )}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Component</TableHead>
            <TableHead>Required</TableHead>
            <TableHead>On hand</TableHead>
            <TableHead>Ordered</TableHead>
            <TableHead>Shortfall</TableHead>
            <TableHead>Status</TableHead>
            {canProcure && <TableHead className="w-36" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const issuable = r.on_hand > 0 && !issued.has(r.component_id);
            const alreadyIssued = issued.has(r.component_id);
            const noStock = r.on_hand === 0;

            return (
              <TableRow key={r.component_id}>
                <TableCell className="font-medium">{r.component_label}</TableCell>
                <TableCell>{formatNumber(r.required)}</TableCell>
                <TableCell>{formatNumber(r.on_hand)}</TableCell>
                <TableCell className="text-muted-foreground">{formatNumber(r.ordered)}</TableCell>
                <TableCell>
                  {r.shortfall > 0
                    ? <Badge variant="destructive">{formatNumber(r.shortfall)}</Badge>
                    : <Badge variant="success">0</Badge>}
                </TableCell>
                <TableCell>
                  {alreadyIssued ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700">
                      <CheckCircle2 className="size-3.5" /> Issued
                    </span>
                  ) : r.shortfall <= 0 && r.on_hand >= r.required ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700">
                      <CheckCircle2 className="size-3.5" /> In stock
                    </span>
                  ) : r.on_hand > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                      <AlertTriangle className="size-3.5" /> Partial stock
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MinusCircle className="size-3.5" /> No stock
                    </span>
                  )}
                </TableCell>
                {canProcure && (
                  <TableCell className="text-right">
                    {issuable && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy === r.component_id}
                        onClick={() => issueRow(r)}
                      >
                        <PackageCheck className="size-3.5" />
                        Issue {formatNumber(Math.min(r.required, r.on_hand))}
                      </Button>
                    )}
                    {noStock && r.shortfall > 0 && (
                      <span className="text-xs text-muted-foreground">→ Raise PO</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
