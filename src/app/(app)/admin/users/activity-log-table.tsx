"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";

const CATEGORY_VARIANT: Record<string, "secondary" | "warning" | "success" | "destructive"> = {
  audit: "secondary",
  stock: "warning",
  signature: "success",
  notification: "secondary",
};

const CATEGORY_LABEL: Record<string, string> = {
  audit: "Change",
  stock: "Stock",
  signature: "Signature",
  notification: "Notification",
};

export type LogRow = {
  key: string;
  occurred_at: string;
  category: string;
  text: string;
  link: string | null;
  actor_name: string;
};

export function ActivityLogTable({ rows }: { rows: LogRow[] }) {
  const [query, setQuery] = React.useState("");
  const filtered = rows.filter((r) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return r.text.toLowerCase().includes(q) || r.actor_name.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search activity or person…" />
        <p className="text-sm text-muted-foreground">{filtered.length} of {rows.length}</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>What happened</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">{rows.length === 0 ? "No activity in this range." : "No matches."}</TableCell></TableRow>
          ) : (
            filtered.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.occurred_at)}</TableCell>
                <TableCell><Badge variant={CATEGORY_VARIANT[r.category] ?? "secondary"}>{CATEGORY_LABEL[r.category] ?? r.category}</Badge></TableCell>
                <TableCell>
                  {r.link ? <Link href={r.link} className="hover:underline">{r.text}</Link> : r.text}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
