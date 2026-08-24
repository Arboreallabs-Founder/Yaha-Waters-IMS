"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Combobox } from "@/components/ui/combobox";
import { SearchInput } from "@/components/ui/search-input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatNumber, formatDate, projectLabel } from "@/lib/utils";
import { backfillGrnProject } from "./actions";

export type UntaggedRow = {
  id: string;
  grn_no: string;
  component_label: string;
  qty: number;
  received_at: string | null;
  vendor_name: string | null;
};

export function UntaggedGrnTagger({
  rows,
  projects,
  canWrite,
}: {
  rows: UntaggedRow[];
  projects: { id: string; project_no: string; customer_name?: string | null }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const projectItems = React.useMemo(() => projects.map((p) => ({ value: p.id, label: projectLabel(p) })), [projects]);
  const filtered = rows.filter((r) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return r.grn_no.toLowerCase().includes(q) || r.component_label.toLowerCase().includes(q);
  });

  async function tag(id: string, projectId: string) {
    if (!projectId) return;
    setBusy(id);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("project_id", projectId);
    const res = await backfillGrnProject(fd);
    setBusy(null);
    if (res?.error) alert(res.error);
    else router.refresh();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search GRN no. or component…" />
        <p className="text-sm text-muted-foreground">{filtered.length} of {rows.length}</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>GRN</TableHead>
            <TableHead>Component</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Received</TableHead>
            <TableHead className="w-52">Tag to project</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No matches.</TableCell></TableRow>
          ) : (
            filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.grn_no}</TableCell>
                <TableCell>{r.component_label}</TableCell>
                <TableCell>{formatNumber(r.qty)}</TableCell>
                <TableCell className="text-muted-foreground">{r.vendor_name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(r.received_at)}</TableCell>
                <TableCell>
                  {canWrite ? (
                    <Combobox
                      items={projectItems}
                      value=""
                      onChange={(v) => tag(r.id, v)}
                      disabled={busy === r.id}
                      placeholder={busy === r.id ? "Tagging…" : "— pick project —"}
                    />
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
