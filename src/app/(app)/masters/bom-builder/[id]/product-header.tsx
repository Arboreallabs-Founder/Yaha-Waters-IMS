"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { updateProduct, createCategoryQuick } from "../actions";

type Category = { id: string; name: string };
type Product = {
  id: string;
  sku_code: string;
  model_name: string;
  category_id: string | null;
  is_serialized?: boolean;
  description?: string | null;
};

export function BuilderProductHeader({
  product,
  categories,
  canWrite,
}: {
  product: Product;
  categories: Category[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [sku, setSku] = React.useState(product.sku_code);
  const [model, setModel] = React.useState(product.model_name);
  const [categoryId, setCategoryId] = React.useState(product.category_id ?? "");
  const [serialized, setSerialized] = React.useState(!!product.is_serialized);
  const [description, setDescription] = React.useState(product.description ?? "");
  const [cats, setCats] = React.useState<Category[]>(categories);
  const [newCat, setNewCat] = React.useState("");
  const [addingCat, setAddingCat] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const categoryName = cats.find((c) => c.id === (product.category_id ?? ""))?.name;

  async function addCategory() {
    if (!newCat.trim()) return;
    setError(null);
    setPending(true);
    const fd = new FormData();
    fd.set("name", newCat.trim());
    const res = await createCategoryQuick(fd);
    setPending(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    if (res.id) {
      setCats((prev) => [...prev, { id: res.id!, name: newCat.trim() }]);
      setCategoryId(res.id);
    }
    setNewCat("");
    setAddingCat(false);
  }

  async function save() {
    setError(null);
    setPending(true);
    const fd = new FormData();
    fd.set("id", product.id);
    fd.set("sku_code", sku.trim());
    fd.set("model_name", model.trim());
    fd.set("category_id", categoryId);
    fd.set("is_serialized", serialized ? "on" : "false");
    fd.set("description", description.trim());
    const res = await updateProduct(fd);
    setPending(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 p-5 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">SKU</p>
            <p className="mt-0.5 font-medium">{product.sku_code || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Model</p>
            <p className="mt-0.5 font-medium">{product.model_name || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Category</p>
            <p className="mt-0.5 font-medium">
              {categoryName ?? <Badge variant="warning">none</Badge>}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Serialized</p>
            <p className="mt-0.5 font-medium">{product.is_serialized ? "Yes" : "No"}</p>
          </div>
          {product.description && (
            <div className="min-w-[12rem]">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Description</p>
              <p className="mt-0.5 text-muted-foreground">{product.description}</p>
            </div>
          )}
          {canWrite && (
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>SKU code</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="TRITON-3700-BR" />
          </div>
          <div className="space-y-1.5">
            <Label>Model name</Label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Triton 3700 BR" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Category</Label>
              <button
                type="button"
                onClick={() => setAddingCat((v) => !v)}
                className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="size-3" /> New category
              </button>
            </div>
            {addingCat ? (
              <div className="flex gap-2">
                <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Category name" />
                <Button type="button" size="sm" onClick={addCategory} loading={pending}>Add</Button>
              </div>
            ) : (
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">— none —</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={serialized}
              onChange={(e) => setSerialized(e.target.checked)}
              className="size-4 rounded border-input"
            />
            <span className="text-sm font-medium">Serialized finished good</span>
          </label>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="optional" />
          </div>
        </div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          <Button onClick={save} loading={pending}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}
