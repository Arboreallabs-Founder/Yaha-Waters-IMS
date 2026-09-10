"use client";

import * as React from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadSheet } from "@/lib/xlsx-format";

export function DownloadExcelButton({
  label,
  filename,
  sheetName,
  headers,
  rows,
  colWidths,
  numberFormats,
  disabled,
}: {
  label: string;
  filename: string;
  sheetName: string;
  headers: string[];
  rows: (string | number | null)[][];
  colWidths?: number[];
  /** 0-based column index -> Excel number format, applied to numeric cells only. */
  numberFormats?: Record<number, string>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);

  async function handleDownload() {
    setBusy(true);
    try {
      await downloadSheet({
        aoa: [headers, ...rows],
        filename,
        sheetName,
        colWidths,
        numberFormats,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" onClick={handleDownload} loading={busy} disabled={disabled}>
      <FileSpreadsheet className="size-4" /> {label}
    </Button>
  );
}
