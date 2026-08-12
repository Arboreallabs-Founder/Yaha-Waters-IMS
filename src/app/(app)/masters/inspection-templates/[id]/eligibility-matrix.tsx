"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { ActionResult } from "@/lib/server/crud";

export type EligibilityField = { id: string; label: string };
export type EligibilityComponent = { id: string; component_no: string; name: string };

export function EligibilityMatrix({
  fields,
  components,
  excludedPairs,
  canWrite,
  toggleAction,
}: {
  fields: EligibilityField[];
  components: EligibilityComponent[];
  /** Set of "componentId:fieldId" pairs currently excluded (not eligible). */
  excludedPairs: Set<string>;
  canWrite: boolean;
  toggleAction: (fd: FormData) => Promise<ActionResult>;
}) {
  const [query, setQuery] = React.useState("");
  const [excluded, setExcluded] = React.useState(excludedPairs);
  const [pending, setPending] = React.useState<string | null>(null);

  const filtered = components.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return c.component_no.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
  });

  async function toggle(componentId: string, fieldId: string, currentlyEligible: boolean) {
    const key = `${componentId}:${fieldId}`;
    setPending(key);
    setExcluded((prev) => {
      const next = new Set(prev);
      if (currentlyEligible) next.add(key);
      else next.delete(key);
      return next;
    });
    const fd = new FormData();
    fd.set("component_id", componentId);
    fd.set("field_id", fieldId);
    fd.set("eligible", currentlyEligible ? "false" : "true");
    const res = await toggleAction(fd);
    setPending(null);
    if (res?.error) {
      // revert on failure
      setExcluded((prev) => {
        const next = new Set(prev);
        if (currentlyEligible) next.delete(key);
        else next.add(key);
        return next;
      });
      alert(res.error);
    }
  }

  if (fields.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Add fields to this template first — eligibility is configured per field.</p>;
  }

  return (
    <div>
      <div className="relative mb-3 max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input placeholder="Search components…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
      </div>
      <div className="max-h-[28rem] overflow-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-card">Component</TableHead>
              {fields.map((f) => (
                <TableHead key={f.id} className="text-center">{f.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={fields.length + 1} className="py-8 text-center text-muted-foreground">No components match.</TableCell></TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="sticky left-0 whitespace-nowrap bg-card font-medium">{c.component_no} — {c.name}</TableCell>
                  {fields.map((f) => {
                    const key = `${c.id}:${f.id}`;
                    const eligible = !excluded.has(key);
                    return (
                      <TableCell key={f.id} className="text-center">
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={eligible}
                          disabled={!canWrite || pending === key}
                          onChange={() => toggle(c.id, f.id, eligible)}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
