"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";
import type { ActionResult } from "@/lib/server/crud";

type VariantRule = { param?: string; map?: Record<string, { component_no?: string; qty?: number }> };
export type Line = {
  id: string;
  component_id: string | null;
  component_label: string;
  quantity: number;
  is_variant_driven: boolean;
  variant_rule: VariantRule | null;
  note: string | null;
};
type Component = { id: string; component_no: string; name: string };
type DropdownParam = { name: string; options: (string | number)[] };
type RuleRow = { componentId: string; qty: string };

export function TemplateLineEditor({
  templateId,
  lines,
  components,
  dropdownParams,
  canWrite,
  upsertAction,
  removeAction,
}: {
  templateId: string;
  lines: Line[];
  components: Component[];
  dropdownParams: DropdownParam[];
  canWrite: boolean;
  upsertAction: (fd: FormData) => Promise<ActionResult>;
  removeAction: (fd: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const compById = React.useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);
  const compByNo = React.useMemo(
    () => new Map(components.map((c) => [c.component_no.toLowerCase(), c.id])),
    [components],
  );
  const paramByName = React.useMemo(() => new Map(dropdownParams.map((p) => [p.name, p])), [dropdownParams]);

  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [componentId, setComponentId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [isVariant, setIsVariant] = React.useState(false);
  const [ruleParam, setRuleParam] = React.useState("");
  const [ruleRows, setRuleRows] = React.useState<Record<string, RuleRow>>({});
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const filtered = lines.filter(
    (l) => !query || l.component_label.toLowerCase().includes(query.toLowerCase()),
  );

  function reset() {
    setComponentId("");
    setQuantity("1");
    setIsVariant(false);
    setRuleParam("");
    setRuleRows({});
    setNote("");
    setError(null);
  }

  function openCreate() {
    reset();
    setEditingId(null);
    setOpen(true);
  }

  function openEdit(line: Line) {
    reset();
    setEditingId(line.id);
    setComponentId(line.component_id ?? "");
    setQuantity(String(line.quantity ?? 1));
    setIsVariant(line.is_variant_driven);
    setNote(line.note ?? "");
    if (line.is_variant_driven && line.variant_rule?.param) {
      const param = line.variant_rule.param;
      setRuleParam(param);
      const rows: Record<string, RuleRow> = {};
      for (const opt of paramByName.get(param)?.options ?? []) {
        const key = String(opt);
        const entry = line.variant_rule.map?.[key];
        rows[key] = {
          componentId: entry?.component_no ? compByNo.get(entry.component_no.toLowerCase()) ?? "" : "",
          qty: String(entry?.qty ?? 1),
        };
      }
      setRuleRows(rows);
    }
    setOpen(true);
  }

  function onParamChange(name: string) {
    setRuleParam(name);
    const rows: Record<string, RuleRow> = {};
    for (const opt of paramByName.get(name)?.options ?? []) {
      const key = String(opt);
      rows[key] = ruleRows[key] ?? { componentId: "", qty: "1" };
    }
    setRuleRows(rows);
  }

  function setRow(key: string, patch: Partial<RuleRow>) {
    setRuleRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let variantRuleStr = "";
    if (isVariant) {
      if (!ruleParam) {
        setError("Choose the parameter that drives this line.");
        return;
      }
      const map: Record<string, { component_no: string; qty: number }> = {};
      for (const opt of paramByName.get(ruleParam)?.options ?? []) {
        const key = String(opt);
        const row = ruleRows[key];
        if (row?.componentId) {
          const comp = compById.get(row.componentId)!;
          map[key] = { component_no: comp.component_no, qty: Number(row.qty) || 1 };
        }
      }
      if (Object.keys(map).length === 0) {
        setError("Pick a component for at least one configuration value.");
        return;
      }
      variantRuleStr = JSON.stringify({ param: ruleParam, map });
    } else if (!componentId) {
      setError("Pick a component.");
      return;
    }

    const fd = new FormData();
    fd.set("bom_template_id", templateId);
    if (editingId) fd.set("id", editingId);
    if (componentId) fd.set("component_id", componentId);
    fd.set("quantity", quantity);
    if (isVariant) fd.set("is_variant_driven", "on");
    if (variantRuleStr) fd.set("variant_rule", variantRuleStr);
    if (note) fd.set("note", note);

    setPending(true);
    const res = await upsertAction(fd);
    setPending(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  async function onDelete(line: Line) {
    if (!confirm("Delete this line?")) return;
    const fd = new FormData();
    fd.set("id", line.id);
    const res = await removeAction(fd);
    if (res?.error) alert(res.error);
    else router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Search lines…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
        </div>
        <p className="text-sm text-muted-foreground">{filtered.length} of {lines.length}</p>
        {canWrite && (
          <Button onClick={openCreate}>
            <Plus className="size-4" /> Add line
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Component</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Varies by</TableHead>
            <TableHead>Note</TableHead>
            {canWrite && <TableHead className="w-20 text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canWrite ? 6 : 5} className="py-8 text-center text-muted-foreground">
                No lines yet.
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.component_label}</TableCell>
                <TableCell>{formatNumber(l.quantity)}</TableCell>
                <TableCell>
                  {l.is_variant_driven ? <Badge variant="warning">Variant</Badge> : <Badge variant="secondary">Common</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">{ruleSummary(l)}</TableCell>
                <TableCell className="text-muted-foreground">{l.note ?? "—"}</TableCell>
                {canWrite && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(l)} aria-label="Edit">
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onDelete(l)} aria-label="Delete">
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

      <Dialog open={open} onClose={() => setOpen(false)} title={`${editingId ? "Edit" : "Add"} BOM line`} className="max-w-2xl">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{isVariant ? "Default component (optional)" : "Component"}</Label>
              <Select value={componentId} onChange={(e) => setComponentId(e.target.value)}>
                <option value="">— none —</option>
                {components.map((c) => (
                  <option key={c.id} value={c.id}>{c.component_no} — {c.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{isVariant ? "Default qty" : "Quantity"}</Label>
              <Input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isVariant}
              disabled={dropdownParams.length === 0}
              onChange={(e) => {
                setIsVariant(e.target.checked);
                if (e.target.checked && !ruleParam && dropdownParams[0]) onParamChange(dropdownParams[0].name);
              }}
              className="size-4 rounded border-input"
            />
            <span className="text-sm font-medium">
              This line varies by configuration
              {dropdownParams.length === 0 && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">(no dropdown parameters on this product)</span>
              )}
            </span>
          </label>

          {isVariant && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="space-y-1.5">
                <Label>Driven by parameter</Label>
                <Select value={ruleParam} onChange={(e) => onParamChange(e.target.value)}>
                  <option value="">— choose —</option>
                  {dropdownParams.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </Select>
              </div>

              {ruleParam && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    For each {ruleParam} value, choose the component &amp; qty
                  </p>
                  {(paramByName.get(ruleParam)?.options ?? []).map((opt) => {
                    const key = String(opt);
                    const row = ruleRows[key] ?? { componentId: "", qty: "1" };
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-sm font-medium">{key}</span>
                        <Select value={row.componentId} onChange={(e) => setRow(key, { componentId: e.target.value })} className="flex-1">
                          <option value="">— (skip) —</option>
                          {components.map((c) => (
                            <option key={c.id} value={c.id}>{c.component_no} — {c.name}</option>
                          ))}
                        </Select>
                        <Input
                          type="number"
                          step="any"
                          value={row.qty}
                          onChange={(e) => setRow(key, { qty: e.target.value })}
                          className="w-20"
                          aria-label="qty"
                        />
                      </div>
                    );
                  })}
                  <p className="text-xs text-muted-foreground">
                    Leave a value as “(skip)” if that configuration doesn’t use this line.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional (e.g. sub-assembly)" />
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

function ruleSummary(l: Line): string {
  if (!l.is_variant_driven || !l.variant_rule?.param) return "—";
  const entries = Object.entries(l.variant_rule.map ?? {})
    .map(([v, e]) => `${v}: ${e.component_no ?? "—"}×${e.qty ?? 1}`)
    .join(", ");
  return `${l.variant_rule.param} → ${entries}`;
}
