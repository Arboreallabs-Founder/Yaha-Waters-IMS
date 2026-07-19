import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canSeeFinancials } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRowCard } from "@/components/ui/mobile-row-card";
import { formatINR, formatNumber } from "@/lib/utils";

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
      {rows.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">No stock on hand yet. Receive a GRN to create lots.</p>
      ) : (
        <>
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>UoM</TableHead>
                  <TableHead>On hand</TableHead>
                  <TableHead>Lots</TableHead>
                  {finance && <TableHead>Value</TableHead>}
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.component_id}>
                    <TableCell className="font-medium">{r.component_no}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.uom ?? "—"}</TableCell>
                    <TableCell>{formatNumber(r.qty_on_hand)}</TableCell>
                    <TableCell>{formatNumber(r.lot_count ?? 0)}</TableCell>
                    {finance && <TableCell>{formatINR((r as { stock_value?: number }).stock_value ?? 0)}</TableCell>}
                    <TableCell className="text-right">
                      <Link
                        href={`/inventory/${r.component_id}`}
                        aria-label="View lots"
                        className={buttonVariants({ variant: "ghost", size: "icon" })}
                      >
                        <ArrowRight className="size-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 sm:hidden">
            {rows.map((r) => (
              <Link key={r.component_id} href={`/inventory/${r.component_id}`} className="block">
                <MobileRowCard
                  title={`${r.component_no} — ${r.name}`}
                  subtitle={r.uom ?? undefined}
                  fields={[
                    { label: "On hand", value: formatNumber(r.qty_on_hand) },
                    { label: "Lots", value: formatNumber(r.lot_count ?? 0) },
                    ...(finance ? [{ label: "Value", value: formatINR((r as { stock_value?: number }).stock_value ?? 0) }] : []),
                  ]}
                />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
