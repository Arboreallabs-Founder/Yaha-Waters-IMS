"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

type ActionResult = { ok?: true; error?: string };

export function AdvancePhaseButton({
  projectId,
  nextPhase,
  label,
  updateAction,
}: {
  projectId: string;
  nextPhase: string;
  label: string;
  updateAction: (fd: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("status", nextPhase);
    const res = await updateAction(fd);
    setBusy(false);
    if (res?.error) { setErr(res.error); return; }
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
      >
        {busy ? "Saving…" : label} {!busy && <ArrowRight className="size-3" />}
      </button>
      {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
    </div>
  );
}
