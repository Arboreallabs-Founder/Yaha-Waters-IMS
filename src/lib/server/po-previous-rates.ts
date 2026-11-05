import "server-only";
import type { Database } from "@/lib/database.types";
import type { createClient } from "@/lib/supabase/server";
import type { PriceIncrease } from "@/lib/price-increase";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type Row = Database["public"]["Functions"]["po_line_previous_rates"]["Returns"][number];

/**
 * For every line on these POs, the rate its component last went out at on an
 * earlier PO (see po_line_previous_rates). Lines bought for the first time have
 * no row. Returns nothing for roles that can't see prices — the database
 * enforces that too, so callers should still only ask when the viewer can.
 */
export async function getPoPreviousRates(supabase: SupabaseClient, poIds: string[]): Promise<Row[]> {
  const ids = [...new Set(poIds)];
  if (ids.length === 0) return [];
  const out: Row[] = [];
  // RPC args travel in the request body, but keep each call modest anyway.
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.rpc("po_line_previous_rates", { p_po_ids: ids.slice(i, i + 200) });
    if (error) throw new Error(`po_line_previous_rates: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

/** The lines priced above their previous rate, grouped by PO. */
export function priceIncreasesByPo(rows: Row[]): Map<string, PriceIncrease[]> {
  const byPo = new Map<string, PriceIncrease[]>();
  for (const r of rows) {
    if (r.rate == null || r.previous_rate == null || !(Number(r.rate) > Number(r.previous_rate))) continue;
    const list = byPo.get(r.po_id) ?? [];
    list.push({
      lineId: r.line_id,
      componentId: r.component_id,
      rate: Number(r.rate),
      previousRate: Number(r.previous_rate),
      previousPoNo: r.previous_po_no,
      previousPoDate: r.previous_po_date,
    });
    byPo.set(r.po_id, list);
  }
  return byPo;
}
