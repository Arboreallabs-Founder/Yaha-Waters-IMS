"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { ActionResult } from "@/lib/server/crud";

export type TemplateField = {
  id: string;
  label: string;
  field_type: string;
  options: string[] | null;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
};

function optionsToText(options: string[] | null): string {
  return options ? options.join(", ") : "";
}

const FIELD_TYPE_LABELS: Record<string, string> = { text: "Text", number: "Number", choice: "Multiple choice", checkbox: "Checkbox" };

export function TemplateFieldEditor({
  templateId,
  fields,
  canWrite,
  upsertAction,
  removeAction,
}: {
  templateId: string;
  fields: TemplateField[];
  canWrite: boolean;
  upsertAction: (fd: FormData) => Promise<ActionResult>;
  removeAction: (fd: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [label, setLabel] = React.useState("");
  const [fieldType, setFieldType] = React.useState("text");
  const [options, setOptions] = React.useState("");
  const [isRequired, setIsRequired] = React.useState(true);
  const [sortOrder, setSortOrder] = React.useState("0");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const activeFields = fields.filter((f) => f.is_active).sort((a, b) => a.sort_order - b.sort_order);

  function reset() {
    setLabel("");
    setFieldType("text");
    setOptions("");
    setIsRequired(true);
    setSortOrder("0");
    setError(null);
  }
  function openCreate() {
    reset();
    setEditingId(null);
    setSortOrder(String(activeFields.length));
    setOpen(true);
  }
  function openEdit(f: TemplateField) {
    reset();
    setEditingId(f.id);
    setLabel(f.label);
    setFieldType(f.field_type);
    setOptions(optionsToText(f.options));
    setIsRequired(f.is_required);
    setSortOrder(String(f.sort_order));
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label.trim()) { setError("Enter a field label."); return; }
    if (fieldType === "choice" && !options.trim()) { setError("Enter at least one option (comma-separated)."); return; }

    const fd = new FormData();
    fd.set("template_id", templateId);
    if (editingId) fd.set("id", editingId);
    fd.set("label", label.trim());
    fd.set("field_type", fieldType);
    if (fieldType === "choice") fd.set("options", options.trim());
    if (isRequired) fd.set("is_required", "on");
    fd.set("sort_order", sortOrder);

    setPending(true);
    const res = await upsertAction(fd);
    setPending(false);
    if (res?.error) { setError(res.error); return; }
    setOpen(false);
    reset();
    router.refresh();
  }

  async function onDelete(f: TemplateField) {
    if (!confirm(`Remove "${f.label}"? Past inspections that used it are kept, just hidden from new ones.`)) return;
    const fd = new FormData();
    fd.set("id", f.id);
    const res = await removeAction(fd);
    if (res?.error) alert(res.error);
    else router.refresh();
  }

  return (
    <div>
      {canWrite && (
        <div className="mb-4 flex justify-end">
          <Button onClick={openCreate}><Plus className="size-4" /> Add field</Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Options</TableHead>
            <TableHead>Required</TableHead>
            {canWrite && <TableHead className="w-20 text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {activeFields.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canWrite ? 5 : 4} className="py-8 text-center text-muted-foreground">
                No fields yet.
              </TableCell>
            </TableRow>
          ) : (
            activeFields.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.label}</TableCell>
                <TableCell><Badge variant="secondary">{FIELD_TYPE_LABELS[f.field_type] ?? f.field_type}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{optionsToText(f.options) || "—"}</TableCell>
                <TableCell>{f.is_required ? <Badge variant="warning">Required</Badge> : <span className="text-muted-foreground">Optional</span>}</TableCell>
                {canWrite && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(f)} aria-label="Edit"><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onDelete(f)} aria-label="Remove"><Trash2 className="size-4" /></Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={open} onClose={() => setOpen(false)} title={`${editingId ? "Edit" : "Add"} field`}>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Dimension check (mm)" required />
          </div>
          <div className="space-y-1.5">
            <Label>Data type</Label>
            <Select value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="choice">Multiple choice</option>
              <option value="checkbox">Checkbox</option>
            </Select>
          </div>
          {fieldType === "choice" && (
            <div className="space-y-1.5">
              <Label>Options</Label>
              <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Pass, Fail" />
              <p className="text-xs text-muted-foreground">Comma-separated — these become the tick-box choices.</p>
            </div>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} className="size-4 rounded border-input" />
            <span className="text-sm font-medium">Required — must be filled in to submit the IRN</span>
          </label>
          <div className="space-y-1.5">
            <Label>Sort order</Label>
            <Input type="number" step="1" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
