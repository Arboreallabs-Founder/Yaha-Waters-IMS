"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatNumber, projectLabel } from "@/lib/utils";
import { backfillProjectTag } from "./actions";

export type UntaggedLine = {
  id: string;
  po_id: string;
  po_no: string;
  component_label: string;
  qty_ordered: number;
};

export function UntaggedWorklist({
  lines,
  projects,
  canWrite,
}: {
  lines: UntaggedLine[];
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
    const res = await backfillProjectTag(fd);
    setBusy(null);
    if (res?.error) alert(res.error);
    else router.refresh();
  }

  if (lines.length === 0) return null;

  return (
    <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="size-4 text-amber-600" />
        <h2 className="text-sm font-semibold text-amber-800">
          Untagged PO lines <Badge variant="warning" className="ml-1">{lines.length}</Badge>
        </h2>
        <span className="text-xs text-amber-700">— ordered with no project. Tag them to a project below.</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>PO</TableHead>
            <TableHead>Component</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead className="w-56">Tag to project</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell>
                <Link href={`/purchase-orders/${l.po_id}`} className="font-medium text-primary hover:underline">{l.po_no}</Link>
              </TableCell>
              <TableCell>{l.component_label}</TableCell>
              <TableCell>{formatNumber(l.qty_ordered)}</TableCell>
              <TableCell>
                {canWrite ? (
                  <Select defaultValue="" disabled={busy === l.id} onChange={(e) => tag(l.id, e.target.value)}>
                    <option value="">{busy === l.id ? "Tagging…" : "— pick project —"}</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{projectLabel(p)}</option>)}
                  </Select>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
