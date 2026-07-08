"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MinusCircle, MoveRight, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { consumeLot, transferLot, adjustLot, type ActionResult } from "../../actions";

export function LotActions({
  lotId,
  qtyOnHand,
  projects,
  canManage,
  onDone,
}: {
  lotId: string;
  qtyOnHand: number;
  projects: { id: string; project_no: string }[];
  canManage: boolean;
  /** Called after a successful action (e.g. scan screen re-resolves the lot). */
  onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run(action: (fd: FormData) => Promise<ActionResult>, fd: FormData, key: string, onOk?: () => void) {
    setBusy(key); setError(null);
    fd.set("lot_id", lotId);
    const res = await action(fd);
    setBusy(null);
    if (res?.error) { setError(res.error); return; }
    onOk?.();
    if (onDone) onDone();
    else router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Consume */}
      <form onSubmit={(e) => { e.preventDefault(); run(consumeLot, new FormData(e.currentTarget), "consume", () => e.currentTarget.reset?.()); }}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
        <div className="flex-1 min-w-[160px]">
          <Label className="mb-1 block text-xs">Consume into project</Label>
          <Select name="project_id" required>
            <option value="">— project —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.project_no}</option>)}
          </Select>
        </div>
        <div className="w-24">
          <Label className="mb-1 block text-xs">Qty</Label>
          <Input name="qty" type="number" step="any" min="0" max={qtyOnHand} placeholder={String(qtyOnHand)} />
        </div>
        <Button type="submit" disabled={busy === "consume" || qtyOnHand <= 0}><MinusCircle className="size-4" /> Consume</Button>
      </form>

      {/* Stock-take */}
      <form onSubmit={(e) => { e.preventDefault(); run(adjustLot, new FormData(e.currentTarget), "adjust"); }}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
        <div className="w-32">
          <Label className="mb-1 block text-xs">Stock-take: actual qty</Label>
          <Input name="actual_qty" type="number" step="any" min="0" placeholder={String(qtyOnHand)} />
        </div>
        <Button type="submit" variant="secondary" disabled={busy === "adjust"}><ClipboardCheck className="size-4" /> Adjust</Button>
        <span className="text-xs text-muted-foreground">Writes an adjustment movement for the difference.</span>
      </form>

      {/* Transfer */}
      {canManage && (
        <form onSubmit={(e) => { e.preventDefault(); run(transferLot, new FormData(e.currentTarget), "transfer"); }}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
          <div className="flex-1 min-w-[160px]">
            <Label className="mb-1 block text-xs">Transfer to location</Label>
            <Input name="location" placeholder="e.g. Store-A / Rack-3" />
          </div>
          <Button type="submit" variant="outline" disabled={busy === "transfer"}><MoveRight className="size-4" /> Transfer</Button>
        </form>
      )}
    </div>
  );
}
