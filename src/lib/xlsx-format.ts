import * as XLSX from "xlsx";

/**
 * Set a display number-format (Excel custom format string) on every numeric cell
 * in the given 0-based columns. Row 0 (the header) is skipped. Cells that don't
 * exist (spacer rows, blanked "show once" parent cells) or aren't numeric are
 * left alone, so the values still `SUM` while showing grouping/currency.
 */
export function applyNumberFormats(ws: XLSX.WorkSheet, formats: Record<number, string>): void {
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
