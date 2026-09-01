"use client";

import * as XLSX from "xlsx";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/utils";

export type PoLineEntry = {
  poNo: string;
  poDate: string | null;
  expectedDate: string | null;
  orderedQty: number;
  receivedQty: number;
  remainingQty: number;
  receipts: { grnNo: string; date: string | null; qty: number }[];
  vendorName: string;
  vendorContact: string | null;
  vendorEmail: string | null;
  vendorPan: string | null;
  vendorGst: string | null;
  vendorWebsite: string | null;
};

export type PoRegisterRow = {
  componentNo: string;
  name: string;
  uom: string | null;
  lines: PoLineEntry[];
};

const HEADERS = [
  "Sr. No.", "Component No.", "Material Description", "UOM",
  "PO No.", "PO Date", "Expected Date", "Ordered Qty", "Received Qty", "Remaining Qty",
  "Receipts (GRN — Date — Qty)",
  "Vendor Name", "Vendor Contact No.", "Vendor Email", "Vendor PAN", "Vendor GST No.", "Vendor Website",
];
const COL_WIDTHS = [6, 16, 40, 8, 16, 14, 14, 12, 12, 12, 42, 22, 16, 24, 16, 18, 24];

/** Join per-PO-line fragments into one newline-stacked spreadsheet cell. */
function stack(lines: string[]) {
  return lines.length ? lines.join("\n") : "—";
}

function receiptsText(entry: PoLineEntry) {
  if (!entry.receipts.length) return "—";
  return entry.receipts
    .map((r) => `${r.grnNo} — ${formatDate(r.date)} — ${formatNumber(r.qty)}`)
    .join(", ");
}

function downloadPoRegisterExcel(rows: PoRegisterRow[]) {
  const aoa: (string | number)[][] = [HEADERS];

  rows.forEach((r, i) => {
    const lines = r.lines.length > 0 ? r.lines : null;
    if (!lines) {
      aoa.push([i + 1, r.componentNo, r.name, r.uom ?? "—", "—", "—", "—", "—", "—", "—", "—", "—", "—", "—", "—", "—", "—"]);
      return;
    }

    const poNo: string[] = [];
    const poDate: string[] = [];
    const expected: string[] = [];
    const ordered: string[] = [];
    const received: string[] = [];
    const remaining: string[] = [];
    const receipts: string[] = [];
    const vName: string[] = [];
    const vContact: string[] = [];
    const vEmail: string[] = [];
    const vPan: string[] = [];
    const vGst: string[] = [];
    const vWebsite: string[] = [];

    for (const e of lines) {
      poNo.push(e.poNo);
      poDate.push(formatDate(e.poDate));
      expected.push(formatDate(e.expectedDate));
      ordered.push(formatNumber(e.orderedQty));
      received.push(formatNumber(e.receivedQty));
      remaining.push(formatNumber(e.remainingQty));
      receipts.push(receiptsText(e));
      vName.push(e.vendorName);
      vContact.push(e.vendorContact ?? "—");
      vEmail.push(e.vendorEmail ?? "—");
      vPan.push(e.vendorPan ?? "—");
      vGst.push(e.vendorGst ?? "—");
      vWebsite.push(e.vendorWebsite ?? "—");
    }

    aoa.push([
      i + 1,
      r.componentNo,
      r.name,
      r.uom ?? "—",
      stack(poNo),
      stack(poDate),
      stack(expected),
      stack(ordered),
      stack(received),
      stack(remaining),
      stack(receipts),
      stack(vName),
      stack(vContact),
      stack(vEmail),
      stack(vPan),
      stack(vGst),
      stack(vWebsite),
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = COL_WIDTHS.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PO Register");
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `PO-Register-${today}.xlsx`);
}

export function DownloadPoRegisterButton({
  rows,
  className,
}: {
  rows: PoRegisterRow[];
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      disabled={rows.length === 0}
      onClick={() => downloadPoRegisterExcel(rows)}
    >
      <FileSpreadsheet className="size-4" /> Download PO Register
    </Button>
  );
}
