"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ActionResult } from "../../site-purchases/actions";

type Component = { id: string; component_no: string; name: string };
type Vendor = { id: string; name: string };

export function SitePurchaseForm({
  projectId,
  bomApproved,
  components,
  vendors,
  showUnitCost,
  action,
}: {
  projectId: string;
  bomApproved: boolean;
  components: Component[];
  vendors: Vendor[];
  showUnitCost: boolean;
  action: (fd: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  if (!bomApproved) {
    return <p className="text-sm text-muted-foreground">Approve the BOM first — site purchases attach to the approved BOM.</p>;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    setMessage(null);
    const fd = new FormData(form);
    fd.set("project_id", projectId);
    const res = await action(fd);
    setBusy(false);
    if (res?.error) { setError(res.error); return; }
    setMessage(res.message ?? "Logged.");
    form.reset();
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Bought something locally for this project and already used it on site? Log it here — no PO, no GRN,
        no QR sticker. It's added straight to the BOM as consumed, and the manager/admin are notified.
      </p>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="size-4 shrink-0" /> {message}
        </div>
      )}

      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 lg:col-span-2">
          <Label>Component</Label>
          <Select name="component_id" required defaultValue="">
            <option value="">— component —</option>
            {components.map((c) => <option key={c.id} value={c.id}>{c.component_no} — {c.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Qty</Label>
          <Input name="qty" type="number" step="any" min="0" required defaultValue="1" />
        </div>
        {showUnitCost && (
          <div className="space-y-1.5">
            <Label>Unit cost (₹)</Label>
            <Input name="unit_cost" type="number" step="any" placeholder="what you paid" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Vendor (if listed)</Label>
          <Select name="vendor_id" defaultValue="">
            <option value="">— not in vendor master —</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Or vendor name</Label>
          <Input name="vendor_name" placeholder="e.g. Local Hardware Store" />
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <Label>Note (optional)</Label>
          <Input name="note" placeholder="what for / why unplanned" />
        </div>
        <div className="flex items-end lg:col-span-4">
          <Button type="submit" disabled={busy}>
            <ShoppingBag className="size-4" /> {busy ? "Logging…" : "Log purchase & consume"}
          </Button>
        </div>
      </form>
    </div>
  );
}
