"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PenLine } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type MySignature = { id: string; label: string | null; method: string; image_data_url: string; is_default: boolean };
export type SignResult = { ok?: true; error?: string; fully_signed?: boolean };

export function DocumentSignButton({
  documentId,
  signatures,
  signAction,
  label = "Sign",
  description,
}: {
  documentId: string;
  signatures: MySignature[];
  signAction: (fd: FormData) => Promise<SignResult>;
  label?: string;
  description?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const defaultSig = signatures.find((s) => s.is_default) ?? signatures[0];
  const [signatureId, setSignatureId] = React.useState(defaultSig?.id ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!signatureId) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("document_id", documentId);
    fd.set("signature_id", signatureId);
    const res = await signAction(fd);
    setBusy(false);
    if (res?.error) { setError(res.error); return; }
    setOpen(false);
    router.refresh();
  }

  if (signatures.length === 0) {
    return (
      <Link href="/account/signature" className={buttonVariants({ variant: "outline" })}>
        <PenLine className="size-4" /> Create a signature to sign
      </Link>
    );
  }

  return (
    <>
      <Button onClick={() => { setError(null); setOpen(true); }}>
        <PenLine className="size-4" /> {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={label} description={description}>
        <form onSubmit={onConfirm} className="space-y-4">
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
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !signatureId}>{busy ? "Signing…" : "Confirm signature"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
