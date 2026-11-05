import { TrendingUp } from "lucide-react";
import { inr, previousRateText, priceIncreaseText, type PriceIncrease } from "@/lib/price-increase";

export type PriceIncreaseItem = PriceIncrease & { label: string; unit: string };

/**
 * The lines on a PO that cost more than last time — shown on the PO page and
 * inside the sign dialog so approvers see the increase before they sign.
 * Only render this for viewers who can see prices.
 */
export function PriceIncreaseNotice({ items, className }: { items: PriceIncreaseItem[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <div className={`rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 ${className ?? ""}`}>
      <p className="flex items-center gap-1.5 font-medium">
        <TrendingUp className="size-4" />
        {items.length === 1 ? "1 line costs more than last time" : `${items.length} lines cost more than last time`}
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((i) => (
          <li key={i.lineId}>
            <span className="font-medium">{i.label}</span>
            {" — "}
            <span className="font-semibold">{priceIncreaseText(i.rate, i.previousRate, i.unit)}</span>
            <span className="block text-xs text-amber-800">
              Now {inr(i.rate)}{i.unit}; last {previousRateText(i, i.unit)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
