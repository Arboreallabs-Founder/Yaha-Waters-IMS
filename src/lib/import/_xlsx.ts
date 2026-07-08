import * as path from "node:path";
import * as XLSX from "xlsx";
import { CONTEXT_DIR } from "./_client";

export type Row = Record<string, unknown>;

/** Read a sheet as an array-of-arrays (raw cells). */
export function readAOA(file: string, sheetName?: string): unknown[][] {
  const wb = XLSX.readFile(path.join(CONTEXT_DIR, file), { cellDates: true });
  const name = sheetName ?? wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error(`Sheet "${name}" not found in ${file}. Sheets: ${wb.SheetNames.join(", ")}`);
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
}

export function norm(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

/** Locate the header row (the first row that contains every required label). */
export function findHeaderRow(aoa: unknown[][], required: string[]): number {
  const want = required.map((r) => r.toLowerCase());
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const cells = (aoa[i] ?? []).map((c) => norm(c).toLowerCase());
    if (want.every((w) => cells.some((c) => c === w || c.startsWith(w)))) return i;
  }
  return -1;
}

/** Build a label → column-index map from a header row (fuzzy: exact, then startsWith). */
export function columnMap(headerRow: unknown[]): (label: string) => number {
  const headers = headerRow.map((h) => norm(h).toLowerCase());
  return (label: string) => {
    const l = label.toLowerCase();
    let idx = headers.findIndex((h) => h === l);
    if (idx === -1) idx = headers.findIndex((h) => h.startsWith(l));
    return idx;
  };
}

/** Parse Excel dates: Date objects, serial numbers, or DD.MM.YYYY / DD-MM-YYYY strings → ISO date. */
export function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    if (v <= 0) return null;
    const d = XLSX.SSF ? XLSX.SSF.parse_date_code(v) : null;
    if (d && d.y >= 1900 && d.m >= 1 && d.d >= 1) {
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
    return null;
  }
  const s = norm(v);
  const m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (m) {
    const [, dd, mm, yy] = m;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return null;
}

export function parseNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const s = norm(v).replace(/[₹,]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
