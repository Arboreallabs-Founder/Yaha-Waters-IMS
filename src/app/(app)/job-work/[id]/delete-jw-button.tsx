"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { removeJwOrder } from "../actions";

const CONFIRM_WORD = "DELETE";

export function DeleteJwButton({ jwId, jwNo }: { jwId: string; jwNo: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function close() {
    setOpen(false);
    setConfirmText("");
    setError(null);
  }

  async function onDelete() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("id", jwId);
    const res = await removeJwOrder(fd);
    setPending(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    router.push("/job-work");
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> Delete JW
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title="Delete job-work order"
        description={`This permanently deletes ${jwNo} and cannot be undone.`}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm
            </Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={confirmText !== CONFIRM_WORD || pending}
              onClick={onDelete}
            >
              {pending ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
