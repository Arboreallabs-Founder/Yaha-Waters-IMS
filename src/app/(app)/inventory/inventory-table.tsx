"use client";

import * as React from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { ArrowRight, FileSpreadsheet } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRowCard } from "@/components/ui/mobile-row-card";
import { formatINR, formatNumber, formatDate } from "@/lib/utils";

export type BreakdownEntry = {
  vendorName: string;
  gstNo: string | null;
  pan: string | null;
  email: string | null;
  website: string | null;
  contact: string | null;
  rate: number | null;
  gstPercent: number | null;
  poNo: string | null;
  poDate: string | null;
  grnNos: string[];
  projectNo: string | null;
  qtyReceived: number;
  qtyBalance: number;
};

export type InventoryRow = {
  component_id: string;
  component_no: string;
  name: string;
  uom: string | null;
  qty_on_hand: number;
  lot_count: number;
  stock_value: number | null;
  breakdown: BreakdownEntry[];
  /** Project(s) this component was actually consumed on — independent of the PO it was ordered against. */
  consumedProjects: { projectNo: string; qty: number }[];
};

const EXPORT_HEADERS = [
  "Sr.No.", "Material Description", "Recived Qty & Balance Stock", "Unit", "Rate", "Amount",
  "GST 18%", "Total Amount", "Vendor Name", "PO. No.", "PO Date", "GRN No.", "Project No.", "Consumed on Project",
  "GST No.", "PAN", "Vendor Contact Details", "Vendor Mail ID", "official Website",
];

function stack(lines: string[]) {
  return lines.length ? lines.join("\n") : "—";
}

function downloadInventoryExcel(rows: InventoryRow[]) {
  const aoa: (string | number)[][] = [EXPORT_HEADERS];

  rows.forEach((r, i) => {
    const groups = r.breakdown.length > 0 ? r.breakdown : [null];
    const qtyLines: string[] = [];
    const rateLines: string[] = [];
    const amountLines: string[] = [];
    const gstLines: string[] = [];
    const totalLines: string[] = [];
    const vendorLines: string[] = [];
    const poNoLines: string[] = [];
    const poDateLines: string[] = [];
    const grnNoLines: string[] = [];
    const projectLines: string[] = [];
    const gstNoLines: string[] = [];
    const panLines: string[] = [];
    const contactLines: string[] = [];
    const emailLines: string[] = [];
    const websiteLines: string[] = [];

    for (const g of groups) {
      if (!g) {
        qtyLines.push(`Recv 0 / Bal ${formatNumber(r.qty_on_hand)}`);
        rateLines.push("—"); amountLines.push("—"); gstLines.push("—"); totalLines.push("—");
        vendorLines.push("—"); poNoLines.push("—"); poDateLines.push("—"); grnNoLines.push("—"); projectLines.push("—");
        gstNoLines.push("—"); panLines.push("—"); contactLines.push("—"); emailLines.push("—"); websiteLines.push("—");
        continue;
      }
      // Value the *received* qty, not the on-hand balance: consumed stock still counts
      // as purchased value until a dispatch step exists.
      const amount = g.rate !== null ? g.rate * g.qtyReceived : null;
      const gstAmount = amount !== null && g.gstPercent !== null ? amount * (g.gstPercent / 100) : null;
      const total = amount !== null && gstAmount !== null ? amount + gstAmount : amount;

      qtyLines.push(`Recv ${formatNumber(g.qtyReceived)} / Bal ${formatNumber(g.qtyBalance)}`);
      rateLines.push(g.rate !== null ? formatNumber(g.rate) : "—");
      amountLines.push(amount !== null ? formatNumber(amount) : "—");
      gstLines.push(gstAmount !== null ? formatNumber(gstAmount) : "—");
      totalLines.push(total !== null ? formatNumber(total) : "—");
      vendorLines.push(g.vendorName);
      poNoLines.push(g.poNo ?? "—");
      poDateLines.push(g.poDate ? formatDate(g.poDate) : "—");
      grnNoLines.push(g.grnNos.length ? g.grnNos.join(", ") : "—");
      projectLines.push(g.projectNo ?? "—");
      gstNoLines.push(g.gstNo ?? "—");
      panLines.push(g.pan ?? "—");
      contactLines.push(g.contact ?? "—");
      emailLines.push(g.email ?? "—");
      websiteLines.push(g.website ?? "—");
    }

    const consumedLines = r.consumedProjects.map(
      (c) => `${c.projectNo}: ${formatNumber(c.qty)}${r.uom ? ` ${r.uom}` : ""} consumed`,
    );

    aoa.push([
      i + 1,
      `${r.component_no} — ${r.name}`,
      stack(qtyLines),
      r.uom ?? "—",
      stack(rateLines),
      stack(amountLines),
      stack(gstLines),
      stack(totalLines),
      stack(vendorLines),
      stack(poNoLines),
      stack(poDateLines),
      stack(grnNoLines),
      stack(projectLines),
      stack(consumedLines),
      stack(gstNoLines),
      stack(panLines),
      stack(contactLines),
      stack(emailLines),
      stack(websiteLines),
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = EXPORT_HEADERS.map((h) => ({
    wch: h === "Consumed on Project" ? 28 : h === "GRN No." ? 24 : 20,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory");
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Inventory-Export-${today}.xlsx`);
}

export function InventoryTable({ rows, exportRows, finance }: { rows: InventoryRow[]; exportRows: InventoryRow[]; finance: boolean }) {
  const [query, setQuery] = React.useState("");
  const matches = (r: { component_no: string; name: string }) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return r.component_no.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
  };
  const filtered = rows.filter(matches);

  if (rows.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No stock on hand yet. Receive a GRN to create lots.</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search component no. or name…" />
        <p className="text-sm text-muted-foreground">{filtered.length} of {rows.length}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => downloadInventoryExcel(exportRows.filter(matches))}
        >
          <FileSpreadsheet className="size-4" /> Download Excel
        </Button>
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
