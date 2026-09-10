"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { createCategoryQuick, updateCategory, removeCategory } from "./actions";

export type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  parent_name: string | null;
  products_using: number;
};

export function CategoryManager({ rows, canWrite }: { rows: CategoryRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [editId, setEditId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [parentId, setParentId] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const options = rows.map((r) => ({ id: r.id, name: r.name }));

  function startEdit(r: CategoryRow) {
    setEditId(r.id);
    setName(r.name);
    setParentId(r.parent_id ?? "");
  }

  async function saveEdit() {
    if (!editId || !name.trim()) return;
    setPending(true);
    const fd = new FormData();
    fd.set("id", editId);
    fd.set("name", name.trim());
    fd.set("parent_id", parentId);
    const res = await updateCategory(fd);
    setPending(false);
    if (res?.error) {
      alert(res.error);
      return;
    }
    setEditId(null);
    router.refresh();
  }

  async function onCreate() {
    if (!newName.trim()) return;
    setPending(true);
    const fd = new FormData();
    fd.set("name", newName.trim());
    const res = await createCategoryQuick(fd);
    setPending(false);
    if (res?.error) {
      alert(res.error);
      return;
    }
    setNewName("");
    setCreating(false);
    router.refresh();
  }

  async function onDelete(r: CategoryRow) {
    if (!confirm(`Delete category "${r.name}"?`)) return;
    const fd = new FormData();
    fd.set("id", r.id);
    const res = await removeCategory(fd);
    if (res?.error) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {canWrite && (
        <div className="mb-3 flex items-center gap-2">
          {creating ? (
            <>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Category name"
                className="max-w-xs"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && onCreate()}
              />
              <Button size="sm" onClick={onCreate} loading={pending}>Add</Button>
              <Button size="sm" variant="outline" onClick={() => { setCreating(false); setNewName(""); }}>Cancel</Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New category
            </Button>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No categories yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Products</TableHead>
              {canWrite && <TableHead className="w-24 text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) =>
              editId === r.id ? (
                <TableRow key={r.id}>
                  <TableCell>
                    <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
                  </TableCell>
                  <TableCell>
                    <Select value={parentId} onChange={(e) => setParentId(e.target.value)} className="h-8">
                      <option value="">— none —</option>
                      {options.filter((o) => o.id !== r.id).map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.products_using}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={saveEdit} loading={pending} aria-label="Save">
                        <Check className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditId(null)} aria-label="Cancel">
                        <X className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.parent_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.products_using}</TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => startEdit(r)} aria-label="Edit">
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => onDelete(r)}
                          aria-label="Delete"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
