"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unissueLot } from "../actions";

export function UnissueLotButton({ lotId, componentId }: { lotId: string; componentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    if (!confirm("Remove this lot's project reservation and return it to open stock?")) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("lot_id", lotId);
    fd.set("component_id", componentId);
    const res = await unissueLot(fd);
    setBusy(false);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        disabled={busy}
        onClick={handleClick}
        title="Unissue — return to open stock"
        className="text-amber-600 hover:text-amber-800"
      >
        <LockOpen className="size-4" />
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </>
  );
}
