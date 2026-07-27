"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveIrn, rejectIrn } from "./irn-actions";

export function IrnApprovalActions({ irnId }: { irnId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function onApprove() {
    setBusy("approve"); setError(null);
    const fd = new FormData();
    fd.set("irn_id", irnId);
    const res = await approveIrn(fd);
    setBusy(null);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  }

  async function onReject() {
    const reason = prompt("Reason for rejection:");
    if (!reason || !reason.trim()) return;
    setBusy("reject"); setError(null);
    const fd = new FormData();
    fd.set("irn_id", irnId);
    fd.set("reason", reason.trim());
    const res = await rejectIrn(fd);
    setBusy(null);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-end gap-1">
        <Button size="sm" disabled={busy !== null} onClick={onApprove}>
          <Check className="size-4" /> Approve
        </Button>
        <Button size="sm" variant="outline" className="text-destructive" disabled={busy !== null} onClick={onReject}>
          <X className="size-4" /> Reject
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
