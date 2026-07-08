"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { createPO } from "./actions";

export function NewPoButton({ vendors }: { vendors: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await createPO(new FormData(e.currentTarget));
    setPending(false);
    if (res?.error) { setError(res.error); return; }
    setOpen(false);
    if (res.id) router.push(`/purchase-orders/${res.id}`);
    else router.refresh();
  }

  return (
    <>
      <Button onClick={() => { setError(null); setOpen(true); }}>
        <Plus className="size-4" /> New PO
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New purchase order">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Vendor (optional)</Label>
            <Select name="vendor_id" defaultValue="">
              <option value="">— decide later —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>PO date</Label>
            <Input name="po_date" type="date" />
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
