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
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import type { ActionResult } from "@/lib/server/crud";

type Param = {
  id: string;
  name: string;
  input_type: string;
  options: unknown;
  min_value: number | null;
  max_value: number | null;
  uom: string | null;
  sort_order: number | null;
};

type InputType = "dropdown" | "number" | "text";

function optionsToText(options: unknown): string {
  if (Array.isArray(options)) return options.join(", ");
  if (options == null) return "";
  return String(options);
}

export function VariantParamEditor({
  productId,
  params,
  canWrite,
  upsertAction,
  removeAction,
}: {
  productId: string;
  params: Param[];
  canWrite: boolean;
  upsertAction: (fd: FormData) => Promise<ActionResult>;
  removeAction: (fd: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<Param | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  function openCreate() { setError(null); setCreating(true); }
  function openEdit(p: Param) { setError(null); setEditing(p); }
  function close() { setCreating(false); setEditing(null); setError(null); }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await upsertAction(new FormData(e.currentTarget));
    setPending(false);
    if (res?.error) { setError(res.error); return; }
    close();
    router.refresh();
  }

  async function onDelete(p: Param) {
    if (!confirm(`Delete parameter "${p.name}"? This cannot be undone.`)) return;
    const fd = new FormData();
    fd.set("id", p.id);
    const res = await removeAction(fd);
    if (res?.error) { alert(res.error); return; }
    router.refresh();
  }

  return (
    <div>
      {canWrite && (
        <div className="mb-4 flex justify-end">
          <Button onClick={openCreate}><Plus className="size-4" /> Add parameter</Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Parameter</TableHead>
            <TableHead>Input type</TableHead>
            <TableHead>Options / Range</TableHead>
            <TableHead>UoM</TableHead>
            {canWrite && <TableHead className="w-20 text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {params.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canWrite ? 6 : 5} className="py-8 text-center text-muted-foreground">
                No variant parameters yet.
              </TableCell>
            </TableRow>
          ) : (
            params.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-muted-foreground">{p.sort_order ?? "—"}</TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell><Badge variant="secondary">{p.input_type}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.input_type === "dropdown" && optionsToText(p.options)}
                  {p.input_type === "number" && (
                    p.min_value != null || p.max_value != null
                      ? `${p.min_value ?? "—"} – ${p.max_value ?? "—"}`
                      : "—"
                  )}
                  {p.input_type === "text" && "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{p.uom ?? "—"}</TableCell>
                {canWrite && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)} aria-label="Edit">
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => onDelete(p)}
                        aria-label="Delete"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog
        open={creating || editing !== null}
        onClose={close}
        title={editing ? "Edit parameter" : "Add parameter"}
      >
        <ParamForm
          productId={productId}
          initial={editing}
          error={error}
          pending={pending}
          onSubmit={onSubmit}
          onCancel={close}
        />
      </Dialog>
    </div>
  );
}

function ParamForm({
  productId,
  initial,
  error,
  pending,
  onSubmit,
  onCancel,
}: {
  productId: string;
  initial: Param | null;
  error: string | null;
  pending: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const [inputType, setInputType] = React.useState<InputType>(
    (initial?.input_type as InputType) ?? "dropdown",
  );

  // Reset input type when the dialog switches between create/edit
  React.useEffect(() => {
    setInputType((initial?.input_type as InputType) ?? "dropdown");
  }, [initial]);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="product_id" value={productId} />

      {/* Always shown */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Parameter name" required className="col-span-2">
          <Input name="name" required placeholder="Inlet Size" defaultValue={initial?.name ?? ""} />
        </Field>

        <Field label="Input type" required>
          <Select
            name="input_type"
            value={inputType}
            onChange={(e) => setInputType(e.target.value as InputType)}
          >
            <option value="dropdown">Dropdown</option>
            <option value="number">Number</option>
            <option value="text">Text</option>
          </Select>
        </Field>

        <Field label="Sort order">
          <Input
            name="sort_order"
            type="number"
            placeholder="0"
            defaultValue={initial?.sort_order ?? ""}
          />
        </Field>
      </div>

      {/* Dropdown only */}
      {inputType === "dropdown" && (
        <Field label="Options" required>
          <Input
            name="options"
            required
            placeholder="6, 8, 10, 12  or  [&quot;A&quot;,&quot;B&quot;]"
            defaultValue={optionsToText(initial?.options)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Comma-separated list — these become the choices shown to the user.
          </p>
        </Field>
      )}

      {/* Number only */}
      {inputType === "number" && (
        <div className="grid grid-cols-3 gap-4">
          <Field label="Min value">
            <Input
              name="min_value"
              type="number"
              step="any"
              placeholder="0"
              defaultValue={initial?.min_value ?? ""}
            />
          </Field>
          <Field label="Max value">
            <Input
              name="max_value"
              type="number"
              step="any"
              placeholder="100"
              defaultValue={initial?.max_value ?? ""}
            />
          </Field>
          <Field label="Unit (UoM)">
            <Input
              name="uom"
              placeholder="inch, µm, LPH"
              defaultValue={initial?.uom ?? ""}
            />
          </Field>
        </div>
      )}

      {/* Text — nothing extra needed */}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
