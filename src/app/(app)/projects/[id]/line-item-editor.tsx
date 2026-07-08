"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { ActionResult } from "./actions";

export type VariantParam = {
  name: string;
  input_type: "dropdown" | "number" | "text";
  options: (string | number)[] | null;
  min_value: number | null;
  max_value: number | null;
  uom: string | null;
};
type Product = { id: string; sku_code: string; model_name: string };
type LineItem = { id: string; product_label: string; variant_text: string; quantity: number };

export function LineItemEditor({
  projectId,
  products,
  paramsByProduct,
  lineItems,
  canWrite,
  addAction,
  removeAction,
}: {
  projectId: string;
  products: Product[];
  paramsByProduct: Record<string, VariantParam[]>;
  lineItems: LineItem[];
  canWrite: boolean;
  addAction: (fd: FormData) => Promise<ActionResult>;
  removeAction: (fd: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [productId, setProductId] = React.useState("");
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [qty, setQty] = React.useState("1");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const params = productId ? paramsByProduct[productId] ?? [] : [];

  function setVal(name: string, v: string) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!productId) {
      setError("Pick a product.");
      return;
    }
    // build variant_selections, coercing numeric values
    const selections: Record<string, string | number> = {};
    for (const p of params) {
      const raw = values[p.name];
      if (raw === undefined || raw === "") continue;
      selections[p.name] = raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
    }
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("product_id", productId);
    fd.set("quantity", qty);
    fd.set("variant_selections", JSON.stringify(selections));
    setPending(true);
    const res = await addAction(fd);
    setPending(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setProductId("");
    setValues({});
    setQty("1");
    router.refresh();
  }

  async function onRemove(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("project_id", projectId);
    const res = await removeAction(fd);
    if (res?.error) alert(res.error);
    else router.refresh();
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <form onSubmit={onAdd} className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Product</Label>
              <Select value={productId} onChange={(e) => { setProductId(e.target.value); setValues({}); }}>
                <option value="">— select —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.sku_code} — {p.model_name}</option>
                ))}
              </Select>
            </div>

            {params.map((p) => (
              <div key={p.name} className="space-y-1.5">
                <Label>
                  {p.name}
                  {p.uom ? ` (${p.uom})` : ""}
                </Label>
                {p.input_type === "dropdown" && p.options ? (
                  <Select value={values[p.name] ?? ""} onChange={(e) => setVal(p.name, e.target.value)}>
                    <option value="">—</option>
                    {p.options.map((o) => (
                      <option key={String(o)} value={String(o)}>{String(o)}</option>
                    ))}
                  </Select>
                ) : p.input_type === "number" ? (
                  <Input
                    type="number"
                    value={values[p.name] ?? ""}
                    min={p.min_value ?? undefined}
                    max={p.max_value ?? undefined}
                    placeholder={p.min_value != null ? `${p.min_value}–${p.max_value}` : ""}
                    onChange={(e) => setVal(p.name, e.target.value)}
                  />
                ) : (
                  <Input value={values[p.name] ?? ""} onChange={(e) => setVal(p.name, e.target.value)} />
                )}
              </div>
            ))}

            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
          </div>
          {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-3">
            <Button type="submit" disabled={pending}>
              <Plus className="size-4" /> {pending ? "Adding…" : "Add line item"}
            </Button>
          </div>
        </form>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Variant</TableHead>
            <TableHead>Qty</TableHead>
            {canWrite && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lineItems.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canWrite ? 4 : 3} className="py-6 text-center text-muted-foreground">
                No line items yet.
              </TableCell>
            </TableRow>
          ) : (
            lineItems.map((li) => (
              <TableRow key={li.id}>
                <TableCell className="font-medium">{li.product_label}</TableCell>
                <TableCell>{li.variant_text || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell><Badge variant="secondary">×{li.quantity}</Badge></TableCell>
                {canWrite && (
                  <TableCell>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onRemove(li.id)} aria-label="Remove">
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
