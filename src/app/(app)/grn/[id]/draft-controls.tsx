"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PenLine, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { startNavProgress } from "@/components/navigation-progress";
import { updateDraftGrn, removeDraftGrnItem, deleteDraftGrn } from "../actions";

/**
 * A draft GRN's own controls (creator or Admin): change the challan / invoice
 * number, or throw the whole draft away. Sign & Send sits in the page header.
 */
export function GrnDraftPanel({
  grnId, grnNo, challanNo, invoiceNo, canEdit, creatorName, isCreator, approverName,
}: {
  grnId: string;
  grnNo: string;
  challanNo: string | null;
  invoiceNo: string | null;
  canEdit: boolean;
  creatorName: string | null;
  isCreator: boolean;
  approverName: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"save" | "delete" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("grn_id", grnId);
    setBusy("save"); setError(null); setSaved(false);
    const res = await updateDraftGrn(fd);
    setBusy(null);
    if (res?.error) { setError(res.error); return; }
    setSaved(true);
    router.refresh();
  }

  async function remove() {
    const fd = new FormData();
    fd.set("grn_id", grnId);
    setBusy("delete"); setError(null);
    const res = await deleteDraftGrn(fd);
    setBusy(null);
    if (res?.error) { setError(res.error); setConfirmDelete(false); return; }
    startNavProgress();
    router.push("/grn");
    router.refresh();
  }

  return (
    <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-medium">This GRN is a draft.</p>
      <p className="mt-0.5">
        {isCreator
          ? <>Add what came in, then press <strong>Sign &amp; Send</strong>. Until then nobody else is asked to sign{approverName ? ` (it goes to ${approverName} when you send it)` : ""}, nothing on it is approved and it can&apos;t be printed.</>
          : <>{creatorName ?? "Its creator"} hasn&apos;t sent it yet. Only they can Sign &amp; Send it.</>}
      </p>

      {canEdit && (
        <form onSubmit={save} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label>Challan No.</Label>
            <Input name="challan_no" defaultValue={challanNo ?? ""} className="bg-background" />
          </div>
          <div className="space-y-1.5">
            <Label>Invoice No.</Label>
            <Input name="invoice_no" defaultValue={invoiceNo ?? ""} className="bg-background" />
          </div>
          <Button type="submit" variant="secondary" loading={busy === "save"}><Save className="size-4" /> Save</Button>
          <Button type="button" variant="outline" className="text-destructive" onClick={() => { setError(null); setConfirmDelete(true); }}>
            <Trash2 className="size-4" /> Delete draft
          </Button>
        </form>
      )}
      {saved && !error && <p className="mt-2 text-xs text-green-700">Saved.</p>}
      {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete ${grnNo}?`}
        description="The draft and everything added to it are removed. Its number isn't reused.">
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button type="button" variant="destructive" loading={busy === "delete"} onClick={remove}>Delete draft</Button>
        </div>
      </Dialog>
    </div>
  );
}

/** Bin button on one line or inspection of a draft GRN. */
export function RemoveDraftItemButton({ grnId, lineId, irnId, label }: { grnId: string; lineId?: string; irnId?: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onClick() {
    if (!window.confirm(`Remove ${label} from this draft?`)) return;
    const fd = new FormData();
    fd.set("grn_id", grnId);
    if (lineId) fd.set("line_id", lineId);
    if (irnId) fd.set("irn_id", irnId);
    setBusy(true); setError(null);
    const res = await removeDraftGrnItem(fd);
    setBusy(false);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="ghost" size="icon" className="text-destructive" aria-label="Remove" loading={busy} onClick={onClick}>
        <Trash2 className="size-4" />
      </Button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}

/** Stand-in for Sign & Send while the draft is still empty. */
export function SendDisabledButton() {
  return (
    <span className="flex flex-col items-end gap-0.5">
      <Button type="button" disabled><PenLine className="size-4" /> Sign &amp; Send</Button>
      <span className="text-xs text-muted-foreground">Add at least one component first</span>
    </span>
  );
}
