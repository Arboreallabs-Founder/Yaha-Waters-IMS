"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRowCard } from "@/components/ui/mobile-row-card";
import { formatINR, formatNumber } from "@/lib/utils";

export type InventoryRow = {
  component_id: string;
  component_no: string;
  name: string;
  uom: string | null;
  qty_on_hand: number;
  lot_count: number;
  stock_value: number | null;
};

export function InventoryTable({ rows, finance }: { rows: InventoryRow[]; finance: boolean }) {
  const [query, setQuery] = React.useState("");
  const filtered = rows.filter((r) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return r.component_no.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
  });

  if (rows.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No stock on hand yet. Receive a GRN to create lots.</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search component no. or name…" />
        <p className="text-sm text-muted-foreground">{filtered.length} of {rows.length}</p>
      </div>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Component</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>UoM</TableHead>
              <TableHead>On hand</TableHead>
              <TableHead>Lots</TableHead>
              {finance && <TableHead>Value</TableHead>}
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={finance ? 7 : 6} className="py-8 text-center text-muted-foreground">No matches.</TableCell></TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.component_id}>
                  <TableCell className="font-medium">{r.component_no}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.uom ?? "—"}</TableCell>
                  <TableCell>{formatNumber(r.qty_on_hand)}</TableCell>
                  <TableCell>{formatNumber(r.lot_count)}</TableCell>
                  {finance && <TableCell>{formatINR(r.stock_value ?? 0)}</TableCell>}
                  <TableCell className="text-right">
                    <Link
                      href={`/inventory/${r.component_id}`}
                      aria-label="View lots"
                      className={buttonVariants({ variant: "ghost", size: "icon" })}
                    >
                      <ArrowRight className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 sm:hidden">
        {filtered.map((r) => (
          <Link key={r.component_id} href={`/inventory/${r.component_id}`} className="block">
            <MobileRowCard
              title={`${r.component_no} — ${r.name}`}
              subtitle={r.uom ?? undefined}
              fields={[
                { label: "On hand", value: formatNumber(r.qty_on_hand) },
                { label: "Lots", value: formatNumber(r.lot_count) },
                ...(finance ? [{ label: "Value", value: formatINR(r.stock_value ?? 0) }] : []),
              ]}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
