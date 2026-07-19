"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatINR, formatNumber, formatDate } from "@/lib/utils";
import { updatePO, addPoLine, updatePoLine, removePoLine, type ActionResult } from "../actions";

type Line = {
  id: string;
  component_id: string | null;
  component_label: string;
  project_id: string | null;
  qty_ordered: number;
  rate: number | null;
  amount: number | null;
  expected_date: string | null;
  line_status: string;
};
type Opt = { id: string; label: string };
type Suggestion = { vendor: string; price: number | null };

const PO_STATUSES = ["draft", "sent", "partial", "completed", "cancelled"];
const LINE_STATUSES = ["pending", "partial", "received", "cancelled"];

export function PoEditor({
  poId,
  header,
  lines,
  components,
  vendors,
  projects,
  suggestions,
  canWrite,
  canSeeFinancials,
}: {
  poId: string;
  header: {
    vendor_id: string | null; po_date: string | null; status: string;
    delivery_terms: string; payment_terms: string; freight_terms: string; gst_percent: number;
  };
  lines: Line[];
  components: { id: string; component_no: string; name: string }[];
  vendors: { id: string; name: string }[];
  projects: Opt[];
  suggestions: Record<string, Suggestion[]>;
  canWrite: boolean;
  canSeeFinancials: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Line | null>(null);
  const [addComp, setAddComp] = React.useState("");
  const projLabel = new Map(projects.map((p) => [p.id, p.label]));

  async function run(action: (fd: FormData) => Promise<ActionResult>, fd: FormData, onOk?: () => void) {
    setBusy(true); setError(null);
    fd.set("po_id", poId);
    const res = await action(fd);
    setBusy(false);
    if (res?.error) { setError(res.error); return; }
    onOk?.(); router.refresh();
  }

  const total = lines.reduce((s, l) => s + Number(l.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      {canWrite ? (
        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("id", poId); run(updatePO, fd); }}
          className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Vendor</Label>
            <Select name="vendor_id" defaultValue={header.vendor_id ?? ""}>
              <option value="">— none —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>PO date</Label>
            <Input name="po_date" type="date" defaultValue={header.po_date ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select name="status" defaultValue={header.status}>
              {PO_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Delivery</Label>
            <Input name="delivery_terms" defaultValue={header.delivery_terms} placeholder="Urgent" />
          </div>
          <div className="space-y-1.5">
            <Label>Payment</Label>
            <Input name="payment_terms" defaultValue={header.payment_terms} placeholder="30 Days" />
          </div>
          <div className="space-y-1.5">
            <Label>Freight</Label>
            <Input name="freight_terms" defaultValue={header.freight_terms} placeholder="At Actual" />
          </div>
          {canSeeFinancials && (
            <div className="space-y-1.5">
              <Label>GST %</Label>
              <Input name="gst_percent" type="number" step="any" defaultValue={header.gst_percent} />
            </div>
          )}
          <div className="sm:col-span-3">
            <Button type="submit" variant="secondary" disabled={busy}><Save className="size-4" /> Save header</Button>
          </div>
        </form>
      ) : (
        <div className="text-sm text-muted-foreground">Status: {header.status}</div>
      )}

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Lines */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Lines</h3>
          {canSeeFinancials && <span className="text-sm text-muted-foreground">Total: {formatINR(total)}</span>}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Component</TableHead>
              <TableHead>Project (tag)</TableHead>
              <TableHead>Qty</TableHead>
              {canSeeFinancials && <TableHead>Rate</TableHead>}
              {canSeeFinancials && <TableHead>Amount</TableHead>}
              <TableHead>Expected</TableHead>
              <TableHead>Line</TableHead>
              {canWrite && <TableHead className="w-20 text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">No lines yet.</TableCell></TableRow>
            ) : (
              lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.component_label}</TableCell>
                  <TableCell>{l.project_id ? projLabel.get(l.project_id) ?? "—" : <Badge variant="secondary">Stock</Badge>}</TableCell>
                  <TableCell>{formatNumber(l.qty_ordered)}</TableCell>
                  {canSeeFinancials && <TableCell>{formatINR(l.rate)}</TableCell>}
                  {canSeeFinancials && <TableCell>{formatINR(l.amount)}</TableCell>}
                  <TableCell className="text-muted-foreground">{formatDate(l.expected_date)}</TableCell>
                  <TableCell><Badge variant={l.line_status === "received" ? "success" : "secondary"}>{l.line_status}</Badge></TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setError(null); setEditing(l); }} aria-label="Edit"><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" aria-label="Remove"
                          onClick={() => { const fd = new FormData(); fd.set("id", l.id); run(removePoLine, fd); }}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add line */}
      {canWrite && (
        <form onSubmit={(e) => { e.preventDefault(); const form = e.currentTarget; run(addPoLine, new FormData(form), () => { form.reset(); setAddComp(""); }); }}
          className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
          <h3 className="text-sm font-semibold">Add line</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 lg:col-span-2">
              <Label>Component</Label>
              <Select name="component_id" required value={addComp} onChange={(e) => setAddComp(e.target.value)}>
                <option value="">— component —</option>
                {components.map((c) => <option key={c.id} value={c.id}>{c.component_no} — {c.name}</option>)}
              </Select>
              {addComp && suggestions[addComp]?.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Supplied by: {suggestions[addComp].map((s) => `${s.vendor}${canSeeFinancials && s.price != null ? ` (${formatINR(s.price)})` : ""}`).join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Project tag (optional)</Label>
              <Select name="project_id" defaultValue="">
                <option value="">Stock (general inventory)</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Qty</Label>
              <Input name="qty_ordered" type="number" step="any" defaultValue="1" />
            </div>
            {canSeeFinancials && (
              <div className="space-y-1.5">
                <Label>Rate (₹)</Label>
                <Input name="rate" type="number" step="any" placeholder="amount auto = rate × qty" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Expected date</Label>
              <Input name="expected_date" type="date" />
            </div>
          </div>
          <Button type="submit" variant="secondary" disabled={busy}><Plus className="size-4" /> Add line</Button>
        </form>
      )}

      {/* Edit line modal */}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit line" description={editing?.component_label}>
        {editing && (
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("id", editing.id); run(updatePoLine, fd, () => setEditing(null)); }} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Project tag (back-fill)</Label>
              <Select name="project_id" defaultValue={editing.project_id ?? ""}>
                <option value="">Stock (general inventory)</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Qty</Label>
                <Input name="qty_ordered" type="number" step="any" defaultValue={editing.qty_ordered} />
              </div>
              <div className="space-y-1.5">
                <Label>Expected date</Label>
                <Input name="expected_date" type="date" defaultValue={editing.expected_date ?? ""} />
              </div>
              {canSeeFinancials && (
                <>
                  <div className="space-y-1.5">
                    <Label>Rate (₹)</Label>
                    <Input name="rate" type="number" step="any" defaultValue={editing.rate ?? ""} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Amount (₹)</Label>
                    <Input name="amount" type="number" step="any" defaultValue={editing.amount ?? ""} placeholder="blank = rate × qty" />
                  </div>
                </>
              )}
              <div className="space-y-1.5">
                <Label>Line status</Label>
                <Select name="line_status" defaultValue={editing.line_status}>
                  {LINE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
