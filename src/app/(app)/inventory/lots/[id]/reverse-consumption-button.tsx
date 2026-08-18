"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { reverseConsumption } from "../../actions";

export function ReverseConsumptionButton({ movementId }: { movementId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("movement_id", movementId);
    fd.set("reason", reason);
    const res = await reverseConsumption(fd);
    setBusy(false);
    if (res?.error) { setError(res.error); return; }
    setOpen(false);
    setReason("");
    router.refresh();
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => { setError(null); setOpen(true); }}
        title="Reverse — return this consumption to open stock"
        className="text-amber-600 hover:text-amber-800"
      >
        <Undo2 className="size-4" />
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Reverse consumption" description="This returns the material to open inventory (no project tag).">
        <form onSubmit={onConfirm} className="space-y-4">
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. consumed by mistake, wrong component scanned" required autoFocus />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>Reverse to open stock</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
