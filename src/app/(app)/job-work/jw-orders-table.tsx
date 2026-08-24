"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

const STATUS_VARIANT: Record<string, "secondary" | "warning" | "success" | "destructive"> = {
  draft: "secondary", sent: "warning", partial: "warning", received: "success", cancelled: "destructive", superseded: "secondary",
};

export type JwOrderRow = {
  id: string;
  jw_no: string;
  project_id: string | null;
  project_label: string | null;
  vendor_name: string | null;
  sent_date: string | null;
  expected_date: string | null;
  status: string;
};

export function JwOrdersTable({ orders }: { orders: JwOrderRow[] }) {
  const [query, setQuery] = React.useState("");
  const filtered = orders.filter((o) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      o.jw_no.toLowerCase().includes(q) ||
      (o.vendor_name ?? "").toLowerCase().includes(q) ||
      (o.project_label ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search JW no., vendor, or project…" />
        <p className="text-sm text-muted-foreground">{filtered.length} of {orders.length}</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>JW No.</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead>Expected</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{orders.length === 0 ? "No job-work orders yet." : "No matches."}</TableCell></TableRow>
          ) : (
            filtered.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.jw_no}</TableCell>
                <TableCell>
                  {o.project_id
                    ? <Link href={`/projects/${o.project_id}`} className="text-primary hover:underline">{o.project_label ?? "—"}</Link>
                    : <span className="text-muted-foreground">stock</span>}
                </TableCell>
                <TableCell>{o.vendor_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(o.sent_date)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(o.expected_date)}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[o.status] ?? "secondary"}>{o.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Link href={`/job-work/${o.id}`} aria-label="Open" className={buttonVariants({ variant: "ghost", size: "icon" })}>
                    <ArrowRight className="size-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
