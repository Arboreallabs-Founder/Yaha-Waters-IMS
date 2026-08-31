"use client";

import * as XLSX from "xlsx";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DownloadExcelButton({
  label,
  filename,
  sheetName,
  headers,
  rows,
  colWidths,
  disabled,
}: {
  label: string;
  filename: string;
  sheetName: string;
  headers: string[];
  rows: (string | number)[][];
  colWidths?: number[];
  disabled?: boolean;
}) {
  function handleDownload() {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    if (colWidths) ws["!cols"] = colWidths.map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  }

  return (
    <Button type="button" variant="outline" onClick={handleDownload} disabled={disabled}>
      <FileSpreadsheet className="size-4" /> {label}
    </Button>
  );
}
