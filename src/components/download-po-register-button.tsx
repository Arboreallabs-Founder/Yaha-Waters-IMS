"use client";

import * as XLSX from "xlsx";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber, formatINR } from "@/lib/utils";

export type PoLineEntry = {
  poNo: string;
  poDate: string | null;
  expectedDate: string | null;
  projectNo: string | null;
  orderedQty: number;
  receivedQty: number;
  remainingQty: number;
  rate: number | null;
  amount: number | null;
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

function downloadPoRegisterExcel(rows: PoRegisterRow[], finance: boolean) {
  // Rate / Amount sit right after "PO No." and are only included for roles that
  // can see financials.
  const headers = [
    "Sr. No.", "Component No.", "Material Description", "UOM",
    "PO No.",
    ...(finance ? ["Rate", "Amount"] : []),
    "PO Date", "Expected Date", "Project No.", "Ordered Qty", "Received Qty", "Remaining Qty",
    "Receipts (GRN — Date — Qty)",
    "Vendor Name", "Vendor Contact No.", "Vendor Email", "Vendor PAN", "Vendor GST No.", "Vendor Website",
  ];
  const colWidths = [
    6, 16, 40, 8,
    16,
    ...(finance ? [14, 16] : []),
    14, 14, 22, 12, 12, 12, 42, 22, 16, 24, 16, 18, 24,
  ];

  const aoa: (string | number)[][] = [headers];

  rows.forEach((r, i) => {
    if (r.lines.length === 0) {
      aoa.push([
        i + 1, r.componentNo, r.name, r.uom ?? "—",
        "—",
        ...(finance ? ["—", "—"] : []),
        "—", "—", "—", "—", "—", "—", "—", "—", "—", "—", "—", "—", "—",
      ]);
      return;
    }

    const poNo: string[] = [];
    const rate: string[] = [];
    const amount: string[] = [];
    const poDate: string[] = [];
    const expected: string[] = [];
    const projectNo: string[] = [];
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

    for (const e of r.lines) {
      poNo.push(e.poNo);
      rate.push(e.rate == null ? "—" : `₹${formatNumber(e.rate)}`);
      amount.push(formatINR(e.amount));
      poDate.push(formatDate(e.poDate));
      expected.push(formatDate(e.expectedDate));
      projectNo.push(e.projectNo ?? "—");
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
      ...(finance ? [stack(rate), stack(amount)] : []),
      stack(poDate),
      stack(expected),
      stack(projectNo),
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
  ws["!cols"] = colWidths.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PO Register");
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `PO-Register-${today}.xlsx`);
}

export function DownloadPoRegisterButton({
  rows,
  finance = false,
  className,
}: {
  rows: PoRegisterRow[];
  finance?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      disabled={rows.length === 0}
      onClick={() => downloadPoRegisterExcel(rows, finance)}
    >
      <FileSpreadsheet className="size-4" /> Download PO Register
    </Button>
  );
}
