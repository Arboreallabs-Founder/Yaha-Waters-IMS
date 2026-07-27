"use client";

import * as React from "react";
import { Package, FileText, Wrench, ClipboardCheck, History } from "lucide-react";
import { QrScanner } from "@/components/qr-scanner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate, formatDateTime, formatNumber, formatINR } from "@/lib/utils";

type Lot = {
  id: string; lot_code: string; component_id: string | null; status: string;
  qty_on_hand: number; qty_initial: number; unit_cost: number | null; jw_stage: string | null;
  created_at: string; component_no?: string; component_name?: string;
};
type LineageEntry = { lot_id: string; lot_code: string; jw_stage: string | null; created_at: string };
type PurchaseOrder = { po_no: string | null; po_date: string | null; raised_by: string | null; vendor_name: string | null; qty_ordered: number | null; rate: number | null };
type Grn = { grn_no: string | null; challan_no: string | null; invoice_no: string | null; received_by: string | null; received_at: string | null; is_untagged: boolean | null };
type JobWork = { jw_no: string; vendor_name: string | null; sent_date: string | null; expected_date: string | null; status: string; qty_sent: number; qty_returned: number; raw_lot_code: string | null; completed_lot_code: string | null };
type Irn = { irn_no: string; status: string; template_name: string | null; generated_by: string | null; generated_at: string; approved_by: string | null; approved_at: string | null; rejection_reason: string | null };
type Movement = { movement_type: string; qty: number; project_no: string | null; reference_type: string | null; reference_id: string | null; performed_by: string | null; performed_at: string; note: string | null };
type Traceability = { lot: Lot; lineage: LineageEntry[]; purchase_order: PurchaseOrder | null; grn: Grn | null; job_work: JobWork[]; irn: Irn | null; movements: Movement[] };

export function TraceabilityScanner({
  lookupAction,
}: {
  lookupAction: (lotCode: string) => Promise<{ ok?: true; error?: string; data?: unknown }>;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Traceability | null>(null);

  async function onDetect(code: string) {
    setPending(true);
    setError(null);
    setResult(null);
    const res = await lookupAction(code);
    setPending(false);
    if (res?.error) { setError(res.error); return; }
    setResult(res.data as Traceability);
  }

  return (
    <div className="space-y-6">
      <QrScanner onDetect={onDetect} pending={pending} />
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {result && (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <Package className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Lot</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <Info label="Component" value={result.lot.component_no ? `${result.lot.component_no} — ${result.lot.component_name}` : "—"} />
                <Info label="Lot code" value={result.lot.lot_code} mono />
                <Info label="Status" value={result.lot.status} />
                <Info label="On hand" value={`${formatNumber(result.lot.qty_on_hand)} / ${formatNumber(result.lot.qty_initial)} initial`} />
                <Info label="Unit cost" value={result.lot.unit_cost != null ? formatINR(result.lot.unit_cost) : "—"} />
                <Info label="Job-work stage" value={result.lot.jw_stage ?? "—"} />
                <Info label="Created" value={formatDateTime(result.lot.created_at)} />
              </div>
            </CardContent>
          </Card>

          {result.lineage.length > 1 && (
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <History className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Lineage (raw → completed)</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {result.lineage.map((l, i) => (
                    <React.Fragment key={l.lot_id}>
                      {i > 0 && <span className="text-muted-foreground">→</span>}
                      <Badge variant={l.jw_stage === "completed" ? "success" : "secondary"}>
                        {l.lot_code}{l.jw_stage ? ` (${l.jw_stage})` : ""}
                      </Badge>
                    </React.Fragment>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Purchase order &amp; receipt</h3>
              </div>
              {result.purchase_order?.po_no || result.grn ? (
                <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <Info label="PO No." value={result.purchase_order?.po_no ?? "— (no PO)"} />
                  <Info label="PO date" value={formatDate(result.purchase_order?.po_date ?? null)} />
                  <Info label="Raised by" value={result.purchase_order?.raised_by ?? "—"} />
                  <Info label="Supplier" value={result.purchase_order?.vendor_name ?? "—"} />
                  <Info label="GRN No." value={result.grn?.grn_no ?? "—"} />
                  <Info label="Challan" value={result.grn?.challan_no ?? "—"} />
                  <Info label="Received by" value={result.grn?.received_by ?? "—"} />
                  <Info label="Received" value={formatDateTime(result.grn?.received_at ?? null)} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No PO/GRN on record for this lot (e.g. created directly, such as a site purchase or job-work output).</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <Wrench className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Job work</h3>
              </div>
              {result.job_work.length === 0 ? (
                <p className="text-sm text-muted-foreground">Never sent for job work.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>JW No.</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead>Qty sent / returned</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.job_work.map((jw, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{jw.jw_no}</TableCell>
                        <TableCell>{jw.vendor_name ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(jw.sent_date)}</TableCell>
                        <TableCell>{formatNumber(jw.qty_sent)} / {formatNumber(jw.qty_returned)}</TableCell>
                        <TableCell><Badge variant="secondary">{jw.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <ClipboardCheck className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Inspection (IRN)</h3>
              </div>
              {result.irn ? (
                <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <Info label="IRN No." value={result.irn.irn_no} mono />
                  <Info label="Template" value={result.irn.template_name ?? "—"} />
                  <Info label="Status" value={result.irn.status} />
                  <Info label="Generated by" value={result.irn.generated_by ?? "—"} />
                  <Info label="Generated" value={formatDateTime(result.irn.generated_at)} />
                  <Info label="Approved/Rejected by" value={result.irn.approved_by ?? "—"} />
                  <Info label="Decided" value={formatDateTime(result.irn.approved_at)} />
                  {result.irn.rejection_reason && <Info label="Reason" value={result.irn.rejection_reason} />}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No inspection was required for this component.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <History className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Consumption history</h3>
              </div>
              {result.movements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No movements recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead>Ref</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.movements.map((m, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground">{formatDateTime(m.performed_at)}</TableCell>
                        <TableCell><Badge variant="secondary">{m.movement_type}</Badge></TableCell>
                        <TableCell className={Number(m.qty) < 0 ? "text-red-600" : "text-green-700"}>{formatNumber(m.qty)}</TableCell>
                        <TableCell>{m.project_no ?? "—"}</TableCell>
                        <TableCell>{m.performed_by ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{m.reference_type ?? "—"}{m.note ? ` — ${m.note}` : ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-medium ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</p>
    </div>
  );
}
