"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, PackageCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";
import { addGrnLine, type ActionResult } from "../actions";

type PoLine = { po_line_id: string; component_id: string; component_label: string; remaining: number; project_id: string | null };
type Posted = { id: string; component_label: string; qty: number; is_untagged: boolean; lot_code: string | null; lot_id: string | null };
type OpenPoEntry = { po_line_id: string; po_no: string; tag: string; remaining: number };
type Component = { id: string; component_no: string; name: string; quantity_type: string };

function QtyHelperLabel({ qt }: { qt: string }) {
  if (qt === "length") return <span className="text-xs text-muted-foreground">Total = pieces × length/pc</span>;
  if (qt === "area")   return <span className="text-xs text-muted-foreground">Total = pieces × width × length</span>;
  return null;
}

export function GrnReceiver({
  grnId,
  poLines,
  postedLines,
  components,
  projects,
  openPoByComponent,
  lotIds,
  canReceive,
  canSeeFinancials,
}: {
  grnId: string;
  poLines: PoLine[];
  postedLines: Posted[];
  components: Component[];
  projects: { id: string; project_no: string }[];
  openPoByComponent: Record<string, OpenPoEntry[]>;
  lotIds: string[];
  canReceive: boolean;
  canSeeFinancials: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [qtys, setQtys] = React.useState<Record<string, string>>({});
  const [manualComp, setManualComp] = React.useState("");
  const [selectedPoLineId, setSelectedPoLineId] = React.useState("");
  // dimension inputs for manual entry
  const [pieceCount, setPieceCount] = React.useState("");
  const [pieceLength, setPieceLength] = React.useState("");
  const [pieceWidth, setPieceWidth] = React.useState("");

  const compMap = React.useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);
  const selectedComp = manualComp ? compMap.get(manualComp) : undefined;
  const qt = selectedComp?.quantity_type ?? "nos";

  // Derived total qty for length/area
  const derivedQty = React.useMemo(() => {
    const pc = Number(pieceCount) || 0;
    const pl = Number(pieceLength) || 0;
    const pw = Number(pieceWidth) || 0;
    if (qt === "length" && pc > 0 && pl > 0) return pc * pl;
    if (qt === "area" && pc > 0 && pl > 0 && pw > 0) return pc * pl * pw;
    return null;
  }, [qt, pieceCount, pieceLength, pieceWidth]);

  React.useEffect(() => {
    setSelectedPoLineId("");
    setPieceCount("");
    setPieceLength("");
    setPieceWidth("");
  }, [manualComp]);

  const matchingPoLines = manualComp ? (openPoByComponent[manualComp] ?? []) : [];

  async function run(fd: FormData, key: string, onOk?: () => void) {
    setBusy(key); setError(null);
    fd.set("grn_id", grnId);
    const res: ActionResult = await addGrnLine(fd);
    setBusy(null);
    if (res?.error) { setError(res.error); return; }
    onOk?.(); router.refresh();
  }

  function receivePoLine(pl: PoLine) {
    const qty = qtys[pl.po_line_id] ?? String(pl.remaining);
    const fd = new FormData();
    fd.set("component_id", pl.component_id);
    fd.set("qty_received", qty);
    fd.set("po_line_id", pl.po_line_id);
    if (pl.project_id) fd.set("project_id", pl.project_id);
    run(fd, pl.po_line_id, () => setQtys((q) => ({ ...q, [pl.po_line_id]: "" })));
  }

  function onManualSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (selectedPoLineId) fd.set("po_line_id", selectedPoLineId);
    // For length/area, override qty_received with the computed total
    if (derivedQty !== null) fd.set("qty_received", String(derivedQty));
    run(fd, "manual", () => {
      form.reset();
      setManualComp("");
      setSelectedPoLineId("");
      setPieceCount(""); setPieceLength(""); setPieceWidth("");
    });
  }

  return (
    <div className="space-y-8">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Receive against linked PO lines */}
      {canReceive && poLines.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Receive against PO</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead className="w-32">Receive qty</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {poLines.map((pl) => (
                <TableRow key={pl.po_line_id}>
                  <TableCell className="font-medium">{pl.component_label}</TableCell>
                  <TableCell>{formatNumber(pl.remaining)}</TableCell>
                  <TableCell>
                    <Input type="number" step="any" value={qtys[pl.po_line_id] ?? ""} placeholder={String(pl.remaining)}
                      onChange={(e) => setQtys((q) => ({ ...q, [pl.po_line_id]: e.target.value }))} />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" disabled={busy === pl.po_line_id} onClick={() => receivePoLine(pl)}>
                      <PackageCheck className="size-4" /> Receive
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {/* Manual / extra line entry */}
      {canReceive && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {poLines.length > 0 ? "Add extra line" : "Enter received material"}
          </h3>
          <form onSubmit={onManualSubmit} className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">

            {/* Component selector */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Component</Label>
                <Select name="component_id" required value={manualComp} onChange={(e) => setManualComp(e.target.value)}>
                  <option value="">— component —</option>
                  {components.map((c) => (
                    <option key={c.id} value={c.id}>{c.component_no} — {c.name}</option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Quantity inputs — vary by lot type */}
            {manualComp && (
              <div className="rounded-md border border-border bg-background p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {qt === "nos" ? "Count" : qt === "length" ? "Length (metres)" : "Area (sq metres)"}
                  </span>
                  <QtyHelperLabel qt={qt} />
                </div>

                {qt === "nos" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Qty received</Label>
                      <Input name="qty_received" type="number" step="any" defaultValue="1" required />
                    </div>
                    {canSeeFinancials && (
                      <div className="space-y-1.5">
                        <Label>Unit cost (₹)</Label>
                        <Input name="unit_cost" type="number" step="any" />
                      </div>
                    )}
                  </div>
                )}

                {qt === "length" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>No. of pieces</Label>
                      <Input type="number" step="1" min="1" value={pieceCount}
                        onChange={(e) => setPieceCount(e.target.value)}
                        name="piece_count" required placeholder="e.g. 10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Length per piece (m)</Label>
                      <Input type="number" step="any" min="0" value={pieceLength}
                        onChange={(e) => setPieceLength(e.target.value)}
                        name="piece_length" required placeholder="e.g. 6" />
                    </div>
                    {canSeeFinancials && (
                      <div className="space-y-1.5">
                        <Label>Unit cost (₹/m)</Label>
                        <Input name="unit_cost" type="number" step="any" />
                      </div>
                    )}
                    {derivedQty !== null && (
                      <div className="sm:col-span-3">
                        <p className="text-sm font-medium text-green-700">
                          Total: <span className="font-bold">{formatNumber(derivedQty)} m</span>
                          <span className="ml-2 text-muted-foreground">({pieceCount} × {pieceLength} m)</span>
                        </p>
                        <input type="hidden" name="qty_received" value={derivedQty} />
                      </div>
                    )}
                  </div>
                )}

                {qt === "area" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label>No. of sheets</Label>
                      <Input type="number" step="1" min="1" value={pieceCount}
                        onChange={(e) => setPieceCount(e.target.value)}
                        name="piece_count" required placeholder="e.g. 5" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Width (m)</Label>
                      <Input type="number" step="any" min="0" value={pieceWidth}
                        onChange={(e) => setPieceWidth(e.target.value)}
                        name="piece_width" required placeholder="e.g. 1.2" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Length (m)</Label>
                      <Input type="number" step="any" min="0" value={pieceLength}
                        onChange={(e) => setPieceLength(e.target.value)}
                        name="piece_length" required placeholder="e.g. 2.4" />
                    </div>
                    {canSeeFinancials && (
                      <div className="space-y-1.5">
                        <Label>Unit cost (₹/m²)</Label>
                        <Input name="unit_cost" type="number" step="any" />
                      </div>
                    )}
                    {derivedQty !== null && (
                      <div className="sm:col-span-4">
                        <p className="text-sm font-medium text-green-700">
                          Total: <span className="font-bold">{formatNumber(derivedQty)} m²</span>
                          <span className="ml-2 text-muted-foreground">({pieceCount} × {pieceWidth}×{pieceLength} m)</span>
                        </p>
                        <input type="hidden" name="qty_received" value={derivedQty} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Open PO lookup */}
            {manualComp && (
              <div className={`rounded-md border px-4 py-3 text-sm ${matchingPoLines.length > 0 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                {matchingPoLines.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 font-medium text-green-800">
                      <CheckCircle2 className="size-4 text-green-600" />
                      Open PO found — select which line this receipt is against:
                    </div>
                    <div className="space-y-1.5">
                      {matchingPoLines.map((pl) => (
                        <label key={pl.po_line_id} className="flex cursor-pointer items-center gap-2.5">
                          <input type="radio" name="_po_line_choice" value={pl.po_line_id}
                            checked={selectedPoLineId === pl.po_line_id}
                            onChange={() => setSelectedPoLineId(pl.po_line_id)}
                            className="accent-primary" />
                          <span className="text-green-800">
                            <span className="font-medium">{pl.po_no}</span>
                            {" · "}{pl.tag}
                            {" · "}{formatNumber(pl.remaining)} remaining
                          </span>
                        </label>
                      ))}
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <input type="radio" name="_po_line_choice" value=""
                          checked={selectedPoLineId === ""}
                          onChange={() => setSelectedPoLineId("")}
                          className="accent-primary" />
                        <span className="text-amber-700">Receive without linking to a PO (will be flagged)</span>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-amber-800">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                    <span>
                      <span className="font-medium">No open PO found for this component.</span>{" "}
                      This receipt will be flagged as untagged and reported to the manager.
                    </span>
                  </div>
                )}
              </div>
            )}

            <input type="hidden" name="po_line_id" value={selectedPoLineId} />

            <div className="flex items-center gap-2">
              <Button type="submit" variant="secondary"
                disabled={busy === "manual" || (qt !== "nos" && derivedQty === null)}>
                <Plus className="size-4" /> Add line
              </Button>
              {!selectedPoLineId && manualComp && matchingPoLines.length === 0 && (
                <span className="text-xs text-amber-600">Will be flagged to manager</span>
              )}
            </div>
          </form>
        </section>
      )}

      {/* Posted lines */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Received lines</h3>
          {lotIds.length > 0 && (
            <Link href={`/inventory/stickers?lots=${lotIds.join(",")}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Print stickers
            </Link>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Component</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Tagged to</TableHead>
              <TableHead>Lot (QR)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {postedLines.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Nothing received yet.</TableCell></TableRow>
            ) : (
              postedLines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.component_label}</TableCell>
                  <TableCell>{formatNumber(l.qty)}</TableCell>
                  <TableCell>
                    {l.is_untagged
                      ? <Badge variant="warning">Untagged — flagged</Badge>
                      : <Badge variant="secondary">PO</Badge>}
                  </TableCell>
                  <TableCell>
                    {l.lot_code && l.lot_id
                      ? <Link href={`/inventory/lots/${l.lot_id}`} className="font-mono text-xs text-primary hover:underline">{l.lot_code}</Link>
                      : (l.lot_code ?? "—")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
