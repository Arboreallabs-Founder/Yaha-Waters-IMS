import type * as XLSXType from "xlsx";

/**
 * SheetJS is ~400 kB and is only ever needed once the user actually clicks an
 * export button, so it is loaded on demand rather than shipped in the page
 * bundle. `import type` above is erased at compile time and keeps the types.
 */
async function loadXlsx(): Promise<typeof XLSXType> {
  return await import("xlsx");
}

/**
 * Set a display number-format (Excel custom format string) on every numeric cell
 * in the given 0-based columns. Row 0 (the header) is skipped. Cells that don't
 * exist (spacer rows, blanked "show once" parent cells) or aren't numeric are
 * left alone, so the values still `SUM` while showing grouping/currency.
 */
export function applyNumberFormats(
  XLSX: typeof XLSXType,
  ws: XLSXType.WorkSheet,
  formats: Record<number, string>,
): void {
  const ref = ws["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  const cols = Object.entries(formats).map(([c, z]) => [Number(c), z] as const);
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    for (const [c, z] of cols) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = z;
    }
  }
}

export type SheetCell = string | number | null;

/**
 * Build a single-sheet workbook from an array-of-arrays and hand it to the
 * browser as a download. The one place SheetJS is loaded from, so every export
 * button stays out of the page's JavaScript bundle until it is clicked.
 */
export async function downloadSheet({
  aoa,
  filename,
  sheetName,
  colWidths,
  numberFormats,
}: {
  /** Row 0 is treated as the header by `numberFormats`. */
  aoa: SheetCell[][];
  filename: string;
  sheetName: string;
  colWidths?: number[];
  /** 0-based column index -> Excel number format, applied to numeric cells only. */
  numberFormats?: Record<number, string>;
}): Promise<void> {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (colWidths) ws["!cols"] = colWidths.map((wch) => ({ wch }));
  if (numberFormats) applyNumberFormats(XLSX, ws, numberFormats);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
