import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canSeeFinancials } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { GrnReceiver } from "./grn-receiver";

export default async function GrnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const role = profile?.role;
  const canReceive = role === "admin" || role === "team_lead" || role === "team_member";
  const supabase = await createClient();

  const { data: grn } = await supabase.from("grns").select("*").eq("id", id).single();
  if (!grn) notFound();

  const [{ data: grnLines }, { data: components }, { data: projects }, vendor, { data: poOpenLines }, { data: allOpenPoLines }] =
    await Promise.all([
      supabase.from("grn_lines").select("*").eq("grn_id", id).order("created_at"),
      supabase.from("components").select("id, component_no, name, quantity_type").order("component_no"),
      supabase.from("projects").select("id, project_no").order("project_no"),
      grn.vendor_id ? supabase.from("vendors").select("name").eq("id", grn.vendor_id).maybeSingle() : Promise.resolve({ data: null }),
      grn.po_id
        ? supabase.from("po_lines").select("*").eq("po_id", grn.po_id).in("line_status", ["pending", "partial"])
        : Promise.resolve({ data: [] }),
      // All open PO lines system-wide for component lookup
      supabase
        .from("po_lines")
        .select("id, po_id, component_id, project_id, qty_ordered, qty_received, purchase_orders(po_no)")
        .in("line_status", ["pending", "partial"]),
    ]);

  const compLabel = new Map((components ?? []).map((c) => [c.id, `${c.component_no} — ${c.name}`]));

  // lots created by this GRN's lines (for lot code display + sticker printing)
  const grnLineIds = (grnLines ?? []).map((l) => l.id);
  const { data: lots } = grnLineIds.length
    ? await supabase.from("inventory_lots").select("id, lot_code, grn_line_id").in("grn_line_id", grnLineIds)
    : { data: [] };
  const lotByLine = new Map((lots ?? []).map((l) => [l.grn_line_id, l]));

  // Build a per-component map of ALL open PO lines (for the lookup hint in manual entry)
  const projNo = new Map((projects ?? []).map((p) => [p.id, p.project_no]));
  type OpenPoEntry = { po_line_id: string; po_no: string; tag: string; remaining: number };
  const openPoByComponent: Record<string, OpenPoEntry[]> = {};
  for (const pl of allOpenPoLines ?? []) {
    if (!pl.component_id) continue;
    const po = pl.purchase_orders as unknown as { po_no: string } | null;
    const remaining = Number(pl.qty_ordered ?? 0) - Number(pl.qty_received ?? 0);
    if (remaining <= 0) continue;
    const entry: OpenPoEntry = {
      po_line_id: pl.id,
      po_no: po?.po_no ?? "—",
      tag: pl.project_id ? `Project: ${projNo.get(pl.project_id) ?? pl.project_id}` : "Stock",
      remaining,
    };
    (openPoByComponent[pl.component_id] ??= []).push(entry);
  }

  const poLines = (poOpenLines ?? []).map((pl) => ({
    po_line_id: pl.id,
    component_id: pl.component_id as string,
    component_label: pl.component_id ? compLabel.get(pl.component_id) ?? "—" : "—",
    remaining: Number(pl.qty_ordered ?? 0) - Number(pl.qty_received ?? 0),
    project_id: pl.project_id,
  })).filter((p) => p.remaining > 0);

  const postedLines = (grnLines ?? []).map((l) => ({
    id: l.id,
    component_label: l.component_id ? compLabel.get(l.component_id) ?? "—" : "—",
    qty: l.qty_received,
    is_untagged: l.is_untagged,
    lot_code: lotByLine.get(l.id)?.lot_code ?? null,
    lot_id: lotByLine.get(l.id)?.id ?? null,
  }));
  const lotIds = (lots ?? []).map((l) => l.id);

  return (
    <div>
      <Link href="/grn" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All goods receipts
      </Link>
      <PageHeader title={grn.grn_no} description={vendor?.data?.name ?? "no vendor"} />

      <Card className="mb-6">
        <CardContent className="grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-4">
          <Info label="Challan" value={grn.challan_no} />
          <Info label="Received" value={formatDate(grn.received_at)} />
          <Info label="Against PO" value={grn.po_id ? "yes" : "untagged"} />
          <Info label="Lines" value={String(postedLines.length)} />
        </CardContent>
      </Card>

      <GrnReceiver
        grnId={id}
        poLines={poLines}
        postedLines={postedLines}
        components={(components ?? []).map((c) => ({ ...c, quantity_type: (c as { quantity_type?: string }).quantity_type ?? "nos" }))}
        projects={projects ?? []}
        openPoByComponent={openPoByComponent}
        lotIds={lotIds}
        canReceive={canReceive}
        canSeeFinancials={canSeeFinancials(role)}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value || "—"}</p>
    </div>
  );
}
