"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { COUNTRY_CODES, COUNTRY_CODE_BY_ISO2, DEFAULT_COUNTRY_ISO2 } from "@/lib/country-codes";
import { customerFormSchema, applySameAsRegistered } from "./schema";
import type { ActionResult } from "@/lib/server/crud";

type CustomerRow = {
  id: string;
  name: string;
  email: string | null;
  phone_country_code: string | null;
  phone_number: string | null;
  gst_no: string | null;
  registered_address: string | null;
  delivery_address: string | null;
};

type Values = {
  name: string;
  email: string;
  phone_country_code: string;
  phone_number: string;
  gst_no: string;
  registered_address: string;
  delivery_address: string;
};
type FieldErrors = Partial<Record<keyof Values, string>>;

function initialValues(row: CustomerRow | null): Values {
  return {
    name: row?.name ?? "",
    email: row?.email ?? "",
    phone_country_code: row?.phone_country_code ?? DEFAULT_COUNTRY_ISO2,
    phone_number: row?.phone_number ?? "",
    gst_no: row?.gst_no ?? "",
    registered_address: row?.registered_address ?? "",
    delivery_address: row?.delivery_address ?? "",
  };
}
function initialSameAsRegistered(row: CustomerRow | null): boolean {
  return !!row?.registered_address && row.registered_address === row.delivery_address;
}

export function CustomerManager({
  rows,
  canWrite,
  upsertAction,
  deleteAction,
}: {
  rows: CustomerRow[];
  canWrite: boolean;
  upsertAction: (fd: FormData) => Promise<ActionResult>;
  deleteAction: (fd: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<CustomerRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const open = creating || editing !== null;

  const [values, setValues] = React.useState<Values>(() => initialValues(null));
  const [sameAsRegistered, setSameAsRegistered] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const filtered = rows.filter((r) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return [r.name, r.email, r.gst_no, r.phone_number].some((v) => (v ?? "").toLowerCase().includes(q));
  });

  function openCreate() {
    setValues(initialValues(null));
    setSameAsRegistered(false);
    setFieldErrors({});
    setError(null);
    setCreating(true);
  }
  function openEdit(row: CustomerRow) {
    setValues(initialValues(row));
    setSameAsRegistered(initialSameAsRegistered(row));
    setFieldErrors({});
    setError(null);
    setEditing(row);
  }
  function close() {
    setCreating(false);
    setEditing(null);
    setError(null);
  }

  function updateField<K extends keyof Values>(name: K, value: Values[K]) {
    setValues((v) => ({ ...v, [name]: value }));
    setFieldErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const transformed = applySameAsRegistered(values, sameAsRegistered);
    const parsed = customerFormSchema.safeParse(transformed);
    if (!parsed.success) {
      const errs: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as keyof Values;
        if (!errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    setPending(true);
    const fd = new FormData();
    if (editing) fd.set("id", editing.id);
    for (const [k, v] of Object.entries(parsed.data)) fd.set(k, v);
    const res = await upsertAction(fd);
    setPending(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    close();
    router.refresh();
  }

  async function onDelete(row: CustomerRow) {
    if (!confirm(`Delete customer "${row.name}"? This cannot be undone.`)) return;
    const fd = new FormData();
    fd.set("id", row.id);
    const res = await deleteAction(fd);
    if (res?.error) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search customers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {rows.length}
        </p>
        {canWrite && (
          <Button onClick={openCreate}>
            <Plus className="size-4" /> Add customer
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>GST No.</TableHead>
            <TableHead>Registered Address</TableHead>
            {canWrite && <TableHead className="w-20 text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canWrite ? 6 : 5} className="py-8 text-center text-muted-foreground">
                No customers yet.
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((row) => {
              const dialCode = row.phone_country_code ? COUNTRY_CODE_BY_ISO2[row.phone_country_code]?.dialCode : null;
              const phoneDisplay = dialCode && row.phone_number ? `${dialCode} ${row.phone_number}` : "—";
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.email || "—"}</TableCell>
                  <TableCell>{phoneDisplay}</TableCell>
                  <TableCell>{row.gst_no || "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">{row.registered_address || "—"}</TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(row)} aria-label="Edit">
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(row)}
                          aria-label="Delete"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <Dialog open={open} onClose={close} title={`${editing ? "Edit" : "Add"} customer`} className="max-w-2xl">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Customer name" required error={fieldErrors.name}>
              <Input value={values.name} onChange={(e) => updateField("name", e.target.value)} />
            </Field>
            <Field label="Email" required error={fieldErrors.email}>
              <Input type="email" value={values.email} onChange={(e) => updateField("email", e.target.value)} />
            </Field>
            <Field label="GST No." required error={fieldErrors.gst_no}>
              <Input value={values.gst_no} onChange={(e) => updateField("gst_no", e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-[160px_1fr] gap-2">
            <Field label="Country code" required error={fieldErrors.phone_country_code}>
              <Select
                value={values.phone_country_code}
                onChange={(e) => updateField("phone_country_code", e.target.value)}
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.iso2} value={c.iso2}>
                    {c.country} ({c.dialCode})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Phone number" required error={fieldErrors.phone_number}>
              <Input
                type="tel"
                inputMode="numeric"
                value={values.phone_number}
                onChange={(e) => updateField("phone_number", e.target.value.replace(/\D/g, ""))}
              />
            </Field>
          </div>

          <Field label="Registered Address" required error={fieldErrors.registered_address}>
            <Textarea
              value={values.registered_address}
              onChange={(e) => updateField("registered_address", e.target.value)}
            />
          </Field>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sameAsRegistered}
              onChange={(e) => setSameAsRegistered(e.target.checked)}
              className="size-4 rounded border-input"
            />
            <span className="text-sm font-medium">Delivery same as registered address</span>
          </label>

          {!sameAsRegistered && (
            <Field label="Delivery Address" required error={fieldErrors.delivery_address}>
              <Textarea
                value={values.delivery_address}
                onChange={(e) => updateField("delivery_address", e.target.value)}
              />
            </Field>
          )}

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
