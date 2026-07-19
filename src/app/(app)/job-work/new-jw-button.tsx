"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { createJwOrder } from "./actions";

export function NewJwButton({
  vendors,
  projects,
}: {
  vendors: { id: string; name: string }[];
  projects: { id: string; project_no: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await createJwOrder(new FormData(e.currentTarget));
    setPending(false);
    if (res?.error) { setError(res.error); return; }
    setOpen(false);
    if (res.id) router.push(`/job-work/${res.id}`);
    else router.refresh();
  }

  return (
    <>
      <Button onClick={() => { setError(null); setOpen(true); }}>
        <Plus className="size-4" /> New job-work order
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New job-work order" description="Send raw material to a job-work vendor; receive the completed part back with rolled cost.">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Job-work vendor</Label>
            <Select name="vendor_id" defaultValue="" required>
              <option value="">— choose vendor —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Project (optional)</Label>
            <Select name="project_id" defaultValue="">
              <option value="">— stock (no project) —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.project_no}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Expected back (optional)</Label>
            <Input name="expected_date" type="date" />
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
