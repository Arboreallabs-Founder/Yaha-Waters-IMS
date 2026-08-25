"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X, PenLine } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { approveIrn, rejectIrn } from "./irn-actions";

type MySig = { id: string; label: string | null; method: string; image_data_url: string; is_default: boolean };

export function IrnApprovalActions({ irnId, signatures }: { irnId: string; signatures: MySig[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const defaultSig = signatures.find((s) => s.is_default) ?? signatures[0];
  const [signatureId, setSignatureId] = React.useState(defaultSig?.id ?? "");
  const [remarks, setRemarks] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function onConfirmApprove(e: React.FormEvent) {
    e.preventDefault();
    if (!signatureId) return;
    setBusy("approve"); setError(null);
    const fd = new FormData();
    fd.set("irn_id", irnId);
    fd.set("signature_id", signatureId);
    if (remarks.trim()) fd.set("remarks", remarks.trim());
    const res = await approveIrn(fd);
    setBusy(null);
    if (res?.error) { setError(res.error); return; }
    setOpen(false);
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

  if (signatures.length === 0) {
    return (
      <div>
        <Link href="/account/signature" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <PenLine className="size-4" /> Create a signature to approve
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end gap-1">
        <Button size="sm" disabled={busy !== null} onClick={() => { setError(null); setOpen(true); }}>
          <Check className="size-4" /> Approve
        </Button>
        <Button size="sm" variant="outline" className="text-destructive" disabled={busy !== null} onClick={onReject}>
          <X className="size-4" /> Reject
        </Button>
      </div>
      {error && !open && <p className="mt-1 text-xs text-red-700">{error}</p>}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Approve inspection with signature"
        description="This also signs the GRN as its QA/QC approver, if you're configured as one."
      >
        <form onSubmit={onConfirmApprove} className="space-y-4">
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="space-y-1.5">
            <Label>Signature</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {signatures.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => setSignatureId(s.id)}
                  className={cn("rounded-md border p-2", signatureId === s.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.image_data_url} className="h-10 w-full object-contain" alt="" />
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{s.label || (s.method === "typed" ? "Typed" : "Drawn")}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Remarks (optional)</Label>
            <textarea
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy === "approve" || !signatureId}>{busy === "approve" ? "Approving…" : "Confirm approval"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
