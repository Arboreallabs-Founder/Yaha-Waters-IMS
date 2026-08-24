"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatNumber, formatINR } from "@/lib/utils";
import { addJwGrnLine } from "../actions";

export type OpenJwLine = {
  id: string; component_id: string; component_label: string;
  jw_no: string; jw_order_id: string; outstanding: number; raw_lot_code: string;
};
export type PostedJwLine = {
  id: string; component_label: string; qty: number; unit_cost: number | null;
  jw_no: string | null; irn_status: string | null; irn_no: string | null;
};
export type TemplateField = {
  id: string; label: string; field_type: string; options: string[] | null; is_required: boolean;
};

const IRN_STATUS_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  approved: "success", pending_approval: "warning", rejected: "destructive",
};

export function JwGrnReceiver({
  grnId, postedLines, openLines, templateFieldsByComponent, carryForwardByLine, canReceive, finance,
}: {
  grnId: string;
  postedLines: PostedJwLine[];
  openLines: OpenJwLine[];
  templateFieldsByComponent: Record<string, TemplateField[]>;
  carryForwardByLine: Record<string, Record<string, string>>;
  canReceive: boolean;
  finance: boolean;
}) {
  const router = useRouter();
  const [lineId, setLineId] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedLine = openLines.find((l) => l.id === lineId) ?? null;
  const templateFields = selectedLine ? templateFieldsByComponent[selectedLine.component_id] ?? [] : [];
  const needsInspection = templateFields.length > 0;
  const openLineItems = React.useMemo(
    () => openLines.map((l) => ({ value: l.id, label: `${l.component_label} — ${l.jw_no} — ${formatNumber(l.outstanding)} outstanding` })),
    [openLines],
  );

  function onPickLine(id: string) {
    setLineId(id);
    const line = openLines.find((l) => l.id === id);
    setQty(line ? String(line.outstanding) : "");
    const fields = line ? templateFieldsByComponent[line.component_id] ?? [] : [];
    const carry = (line && carryForwardByLine[line.id]) ?? {};
    const init: Record<string, string> = {};
    for (const f of fields) {
      const carried = carry[f.label.trim().toLowerCase()];
      if (carried !== undefined) init[f.id] = carried;
    }
    setAnswers(init);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedLine) { setError("Select a job-work line to receive."); return; }
    if (Number(qty) <= 0) { setError("Enter a quantity to receive."); return; }
    if (needsInspection) {
      const missing = templateFields.filter((f) => f.is_required && !answers[f.id]?.trim());
      if (missing.length > 0) { setError(`Missing required field(s): ${missing.map((f) => f.label).join(", ")}`); return; }
    }
    const fd = new FormData();
    fd.set("grn_id", grnId);
    fd.set("jw_line_id", selectedLine.id);
    fd.set("qty", qty);
    if (needsInspection) {
      fd.set("answers", JSON.stringify(templateFields.map((f) => ({ field_id: f.id, value: answers[f.id] ?? "" }))));
    }
    setBusy(true);
    const res = await addJwGrnLine(fd);
    setBusy(false);
    if (res?.error) { setError(res.error); return; }
    setLineId(""); setQty(""); setAnswers({});
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {canReceive && (
        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Job-work line to receive</Label>
              <Combobox
                items={openLineItems}
                value={lineId}
                onChange={onPickLine}
                required
                placeholder={openLines.length ? "— choose —" : "no open job-work lines for this vendor"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Qty received</Label>
              <Input type="number" step="any" min="0" max={selectedLine?.outstanding} value={qty} onChange={(e) => setQty(e.target.value)} required />
            </div>
          </div>

          {needsInspection && (
            <div className="space-y-3 rounded-md border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm font-medium text-blue-900">
                Inspection required before a QR is generated — Heat No. / Test Certificate No. are pre-filled from the raw material's own inspection.
              </p>
              {templateFields.map((f) => (
                <div key={f.id} className="space-y-1.5">
                  {f.field_type === "checkbox" ? (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-input"
                        checked={answers[f.id] === "true"}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [f.id]: e.target.checked ? "true" : "" }))}
                      />
                      <span className="text-sm font-medium">
                        {f.label}
                        {f.is_required && <span className="text-destructive"> *</span>}
                      </span>
                    </label>
                  ) : (
                    <>
                      <Label>
                        {f.label}
                        {f.is_required && <span className="text-destructive"> *</span>}
                      </Label>
                      {f.field_type === "choice" ? (
                        <Select value={answers[f.id] ?? ""} onChange={(e) => setAnswers((prev) => ({ ...prev, [f.id]: e.target.value }))}>
                          <option value="">— choose —</option>
                          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </Select>
                      ) : (
                        <Input
                          type={f.field_type === "number" ? "number" : "text"}
                          step={f.field_type === "number" ? "any" : undefined}
                          value={answers[f.id] ?? ""}
                          onChange={(e) => setAnswers((prev) => ({ ...prev, [f.id]: e.target.value }))}
                        />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={busy || !openLines.length}>
              <PackageCheck className="size-4" /> {busy ? "Receiving…" : "Receive"}
            </Button>
          </div>
        </form>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Component</TableHead>
            <TableHead>JW Order</TableHead>
            <TableHead>Qty received</TableHead>
            {finance && <TableHead>Unit cost</TableHead>}
            <TableHead>Inspection</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {postedLines.length === 0 ? (
            <TableRow><TableCell colSpan={finance ? 5 : 4} className="py-6 text-center text-muted-foreground">No lines yet.</TableCell></TableRow>
          ) : (
            postedLines.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.component_label}</TableCell>
                <TableCell className="text-muted-foreground">{l.jw_no ?? "—"}</TableCell>
                <TableCell>{formatNumber(l.qty)}</TableCell>
                {finance && <TableCell className="text-muted-foreground">{formatINR(l.unit_cost)}</TableCell>}
                <TableCell>
                  {l.irn_status ? (
                    <span className="inline-flex items-center gap-2">
                      <Badge variant={IRN_STATUS_VARIANT[l.irn_status] ?? "secondary"}>{l.irn_status.replace("_", " ")}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">{l.irn_no}</span>
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
