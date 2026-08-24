"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Truck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Dialog } from "@/components/ui/dialog";
import { createGrn } from "./actions";

export function NewGrnButton({
  vendors,
}: {
  vendors: { id: string; name: string }[];
}) {
  const router = useRouter();
  const vendorItems = React.useMemo(() => vendors.map((v) => ({ value: v.id, label: v.name })), [vendors]);
  const [step, setStep] = React.useState<"closed" | "type" | "details">("closed");
  const [isJobWork, setIsJobWork] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function pickType(jobWork: boolean) {
    setIsJobWork(jobWork);
    setStep("details");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const challan = String(fd.get("challan_no") ?? "").trim();
    const invoice = String(fd.get("invoice_no") ?? "").trim();
    if (!challan && !invoice) {
      setError("Enter a challan number or an invoice number — at least one is required.");
      return;
    }
    fd.set("is_job_work", isJobWork ? "true" : "false");
    setPending(true);
    setError(null);
    const res = await createGrn(fd);
    setPending(false);
    if (res?.error) { setError(res.error); return; }
    setStep("closed");
    if (res.id) router.push(`/grn/${res.id}`);
    else router.refresh();
  }

  return (
    <>
      <Button onClick={() => { setError(null); setStep("type"); }}>
        <Plus className="size-4" /> New GRN
      </Button>

      <Dialog open={step === "type"} onClose={() => setStep("closed")} title="What are you receiving?" description="Choose how this GRN should be received.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => pickType(false)}
            className="flex flex-col items-center gap-2 rounded-lg border border-border p-6 text-center hover:border-primary hover:bg-accent"
          >
            <Truck className="size-8 text-muted-foreground" />
            <span className="font-medium">Purchase</span>
            <span className="text-xs text-muted-foreground">Material received from a supplier against a PO.</span>
          </button>
          <button
            type="button"
            onClick={() => pickType(true)}
            className="flex flex-col items-center gap-2 rounded-lg border border-border p-6 text-center hover:border-primary hover:bg-accent"
          >
            <Wrench className="size-8 text-muted-foreground" />
            <span className="font-medium">Job Work</span>
            <span className="text-xs text-muted-foreground">Finished parts returned by a job-work vendor.</span>
          </button>
        </div>
      </Dialog>

      <Dialog
        open={step === "details"}
        onClose={() => setStep("closed")}
        title={isJobWork ? "New job-work GRN" : "New goods receipt"}
        description={
          isJobWork
            ? "Pick the job-work vendor returning material — you'll receive against their open job-work orders next."
            : "Every GRN is created open — attach each line to a project or PO as you receive it."
        }
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Vendor{isJobWork ? "" : " (optional)"}</Label>
            <Combobox items={vendorItems} defaultValue="" name="vendor_id" required={isJobWork} placeholder={`— ${isJobWork ? "choose vendor" : "none"} —`} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Challan No.</Label>
              <Input name="challan_no" placeholder="supplier challan / DC no." />
            </div>
            <div className="space-y-1.5">
              <Label>Invoice No.</Label>
              <Input name="invoice_no" placeholder="supplier tax invoice no." />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            At least one of challan or invoice is required. If the invoice number is left blank, admin/team lead are notified.
          </p>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setStep("type")}>Back</Button>
            <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
