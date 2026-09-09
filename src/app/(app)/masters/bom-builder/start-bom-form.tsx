"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { startBom } from "./actions";

type Category = { id: string; name: string };

export function StartBomForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [model, setModel] = React.useState("");
  const [sku, setSku] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [newCat, setNewCat] = React.useState("");
  const [addingCat, setAddingCat] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData();
    fd.set("model_name", model.trim());
    fd.set("sku_code", sku.trim());
    if (addingCat) fd.set("new_category_name", newCat.trim());
    else fd.set("category_id", categoryId);
    const res = await startBom(fd);
    setPending(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    if (res?.redirect) router.push(res.redirect);
  }

  return (
    <Card>
      <CardContent className="p-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Model name *</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Triton 3700 BR" required />
            </div>
            <div className="space-y-1.5">
              <Label>SKU code *</Label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="TRITON-3700-BR" required />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Category</Label>
                <button
                  type="button"
                  onClick={() => setAddingCat((v) => !v)}
                  className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
                >
                  <Plus className="size-3" /> {addingCat ? "Pick existing" : "New category"}
                </button>
              </div>
              {addingCat ? (
                <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Category name" />
              ) : (
                <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">— none —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              )}
            </div>
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Start BOM"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
