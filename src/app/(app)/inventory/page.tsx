import { createClient } from "@/lib/supabase/server";
import { getProfile, canSeeFinancials } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { formatINR } from "@/lib/utils";
import { InventoryTable } from "./inventory-table";

export default async function InventoryPage() {
  const profile = await getProfile();
  const finance = canSeeFinancials(profile?.role);
  const supabase = await createClient();

  const view = finance ? "v_component_on_hand" : "v_component_on_hand_safe";
  const { data } = await supabase.from(view as "v_component_on_hand").select("*");
  const rows = (data ?? [])
    .map((r) => ({ ...r, qty_on_hand: Number(r.qty_on_hand ?? 0) }))
    .filter((r) => r.qty_on_hand !== 0 || (r.lot_count ?? 0) > 0)
    .sort((a, b) => b.qty_on_hand - a.qty_on_hand);

  const totalValue = finance ? (data ?? []).reduce((s, r) => s + Number((r as { stock_value?: number }).stock_value ?? 0), 0) : null;

  return (
    <div>
      <PageHeader
        title="Inventory — On hand"
        description="Click a component to see its lots and quantities."
      />
      {totalValue !== null && (
        <p className="mb-4 text-sm text-muted-foreground">Total stock value: <span className="font-semibold text-foreground">{formatINR(totalValue)}</span></p>
      )}
      <InventoryTable
        finance={finance}
        rows={rows.map((r) => ({
          component_id: r.component_id,
          component_no: r.component_no,
          name: r.name,
          uom: r.uom,
          qty_on_hand: r.qty_on_hand,
          lot_count: r.lot_count ?? 0,
          stock_value: (r as { stock_value?: number }).stock_value ?? null,
        }))}
      />
    </div>
  );
}
