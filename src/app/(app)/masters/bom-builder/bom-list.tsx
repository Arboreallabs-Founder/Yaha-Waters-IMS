"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Copy, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { duplicateBom, deleteBom } from "./actions";

export type BomRow = {
  id: string;
  label: string;
  sku_code: string;
  model_name: string;
  version: number;
  is_active: boolean;
  line_count: number;
};

export function BomList({ rows, canWrite }: { rows: BomRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [dupRow, setDupRow] = React.useState<BomRow | null>(null);
  const [sku, setSku] = React.useState("");
  const [model, setModel] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  function openDuplicate(r: BomRow) {
    setError(null);
    setSku(`${r.sku_code}-COPY`);
    setModel(`${r.model_name} (copy)`);
    setDupRow(r);
  }

  async function onDuplicate(e: React.FormEvent) {
    e.preventDefault();
    if (!dupRow) return;
    setError(null);
    setPending(true);
    const fd = new FormData();
    fd.set("template_id", dupRow.id);
    fd.set("sku_code", sku.trim());
    fd.set("model_name", model.trim());
    const res = await duplicateBom(fd);
    setPending(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    if (res?.redirect) router.push(res.redirect);
  }

  async function onDelete(r: BomRow) {
    if (
      !confirm(
        `Delete the BOM for "${r.label}"?\n\nThis removes the product, its BOM template, all lines, and its variant parameters. This cannot be undone.`,
      )
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("template_id", r.id);
    const res = await deleteBom(fd);
    if (res?.error) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No product BOMs yet.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.id} className="flex h-full flex-col">
            <CardContent className="flex flex-1 flex-col gap-3 p-4">
              <Link href={`/masters/bom-builder/${r.id}`} className="group flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium group-hover:underline">{r.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    v{r.version} · {r.line_count} line{r.line_count === 1 ? "" : "s"}
                    {r.is_active ? "" : " · inactive"}
                  </p>
                </div>
                {!r.is_active && <Badge variant="secondary">inactive</Badge>}
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
              {canWrite && (
                <div className="mt-auto flex gap-2 border-t border-border pt-3">
                  <Link
                    href={`/masters/bom-builder/${r.id}`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")}
                  >
                    Open
                  </Link>
                  <Button variant="outline" size="sm" onClick={() => openDuplicate(r)} aria-label="Duplicate" title="Duplicate">
                    <Copy className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDelete(r)}
                    aria-label="Delete"
                    title="Delete"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dupRow !== null} onClose={() => setDupRow(null)} title={`Duplicate “${dupRow?.label ?? ""}”`} className="max-w-lg">
        <form onSubmit={onDuplicate} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Copies every line, variant parameter, and folder. Reusable (stock-tracked) sub-assemblies stay shared with the original.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>New SKU code *</Label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>New model name *</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} required />
            </div>
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDupRow(null)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Duplicating…" : "Duplicate"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
