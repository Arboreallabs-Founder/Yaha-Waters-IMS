// Client-safe helpers for the "↑ ₹105/kg (+28%) vs last price" warning on PO
// lines. Only ever used where the viewer can see prices.

export type PreviousRate = {
  previousRate: number;
  previousPoNo: string;
  previousPoDate: string;
};

/** A PO line priced above what the component last cost on an earlier PO. */
export type PriceIncrease = PreviousRate & {
  lineId: string;
  componentId: string;
  rate: number;
};

/** Per-unit suffix for a rate: /kg, /m, or nothing for counted items. */
export function rateUnit(quantityType: string | null | undefined): string {
  if (quantityType === "weight") return "/kg";
  if (quantityType === "length") return "/m";
  return "";
}

/** ₹105, ₹12.5 — paise only when there are some. */
export function inr(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

/** "↑ ₹105/kg (+28%) vs last price", or null when the rate isn't higher. */
export function priceIncreaseText(rate: number | null | undefined, previousRate: number | null | undefined, unit = ""): string | null {
  if (rate == null || previousRate == null || !(rate > previousRate)) return null;
  const diff = rate - previousRate;
  const pct = previousRate > 0 ? (diff / previousRate) * 100 : null;
  const pctText = pct == null ? "" : pct < 1 ? " (+<1%)" : ` (+${Math.round(pct)}%)`;
  return `↑ ${inr(diff)}${unit}${pctText} vs last price`;
}

/** "₹370/kg on YWSPL/26-27/0246R1, 25 Jul 2026" */
export function previousRateText(p: PreviousRate, unit = ""): string {
  const date = new Date(`${p.previousPoDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return `${inr(p.previousRate)}${unit} on ${p.previousPoNo}, ${date}`;
}
