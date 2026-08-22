"use client";

import * as XLSX from "xlsx";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

type LineRow = { sr: number; item: string; uom: string; qty: number; rate: number; amount: number };

export function DownloadExcelButton({
  poNo,
  poDate,
  vendor,
  projectLabel,
  deliveryAddressLines,
  deliveryTerms,
  paymentTerms,
  freightTerms,
  our,
  lineRows,
  subtotal,
  gstPct,
  gstAmount,
  total,
}: {
  poNo: string;
  poDate: string;
  vendor: { name: string; address: string | null; gst_no: string | null } | null;
  projectLabel: string;
  deliveryAddressLines: string[];
  deliveryTerms: string;
  paymentTerms: string;
  freightTerms: string;
  our: { billingName: string; billingAddress: string[]; gstin: string; pan: string };
  lineRows: LineRow[];
  subtotal: number;
  gstPct: number;
  gstAmount: number;
  total: number;
}) {
  function handleDownload() {
    const rows: (string | number)[][] = [
      [our.billingName],
      [our.billingAddress.join(", ")],
      [],
      ["PURCHASE ORDER"],
      [],
      ["PO No.", poNo, "", "PO Date", poDate],
      ["Vendor", vendor?.name ?? "—"],
      ["Vendor Address", vendor?.address?.replace(/\n/g, ", ") ?? "—"],
      ["Vendor GSTIN", vendor?.gst_no ?? "—"],
      ["Project", projectLabel],
      ["Delivery Address", deliveryAddressLines.join(", ")],
      ["Delivery Terms", deliveryTerms, "", "Payment Terms", paymentTerms, "", "Freight Terms", freightTerms],
      [],
      ["Sr No", "Item", "UOM", "Qty", "Rate", "Amount"],
      ...lineRows.map((l) => [l.sr, l.item, l.uom, l.qty, l.rate, l.amount]),
      [],
      ["", "", "", "", "Subtotal", subtotal],
      ["", "", "", "", `GST ${gstPct}%`, gstAmount],
      ["", "", "", "", "Total", total],
      [],
      ["GSTIN", our.gstin, "PAN", our.pan],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 10 }, { wch: 42 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PO");
    XLSX.writeFile(wb, `${poNo.replace(/[\\/]/g, "-")}.xlsx`);
  }

  return (
    <Button variant="outline" onClick={handleDownload} className="print:hidden">
      <FileSpreadsheet className="size-4" /> Download Excel
    </Button>
  );
}
