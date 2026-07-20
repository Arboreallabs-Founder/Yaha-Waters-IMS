"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
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
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">{r.grn_no}</TableCell>
            <TableCell>{r.component_label}</TableCell>
            <TableCell>{formatNumber(r.qty)}</TableCell>
            <TableCell className="text-muted-foreground">{r.vendor_name ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{formatDate(r.received_at)}</TableCell>
            <TableCell>
              {canWrite ? (
                <Select defaultValue="" disabled={busy === r.id} onChange={(e) => tag(r.id, e.target.value)}>
                  <option value="">{busy === r.id ? "Tagging…" : "— pick project —"}</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{projectLabel(p)}</option>)}
                </Select>
              ) : <span className="text-muted-foreground">—</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
