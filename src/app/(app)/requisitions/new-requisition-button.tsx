"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Dialog } from "@/components/ui/dialog";
import { createRequisition } from "./actions";
import { projectLabel } from "@/lib/utils";

export function NewRequisitionButton({ projects }: { projects: { id: string; project_no: string; customer_name?: string | null }[] }) {
  const router = useRouter();
  const projectItems = React.useMemo(() => projects.map((p) => ({ value: p.id, label: projectLabel(p) })), [projects]);
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await createRequisition(new FormData(e.currentTarget));
    setPending(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setOpen(false);
    if (res.id) router.push(`/requisitions/${res.id}`);
    else router.refresh();
  }

  return (
    <>
      <Button onClick={() => { setError(null); setOpen(true); }}>
        <Plus className="size-4" /> New requisition
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New requisition" description="Leave the project blank for a stock requisition.">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project (optional)</Label>
            <Combobox items={projectItems} defaultValue="" name="project_id" placeholder="— stock (no project) —" />
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
