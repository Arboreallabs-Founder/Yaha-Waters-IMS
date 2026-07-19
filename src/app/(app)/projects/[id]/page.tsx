import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters, canSeeFinancials } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatINR } from "@/lib/utils";
import { LineItemEditor, type VariantParam } from "./line-item-editor";
import { BomPanel } from "./bom-panel";
import { IssuedPanel } from "./issued-panel";
import { StockStatusPanel, type StockStatusRow } from "./stock-status-panel";
import { ShortfallPanel } from "./shortfall-panel";
import { PhaseBanner } from "./phase-banner";
import {
  addLineItem,
  removeLineItem,
  generateBom,
  approveBom,
  unapproveBom,
  addManualBomLine,
  removeBomLine,
  updateProjectStatus,
  blockStockForBom,
} from "./actions";

function variantText(sel: unknown): string {
  if (!sel || typeof sel !== "object") return "";
  return Object.entries(sel as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const canWrite = canWriteMasters(profile?.role);
  const supabase = await createClient();

  const { data: project } = await supabase.from("projects").select("*").eq("id", id).single();
  if (!project) notFound();

  const [
    { data: customer },
    { data: products },
    { data: vparams },
    { data: lineItems },
    { data: bom },
    { data: components },
  ] = await Promise.all([
    project.customer_id
      ? supabase.from("customers").select("name").eq("id", project.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("products").select("id, sku_code, model_name").order("sku_code"),
    supabase.from("product_variant_params").select("*").order("sort_order"),
    supabase.from("project_line_items").select("*").eq("project_id", id).order("created_at"),
    supabase.from("boms").select("id, status, approved_at").eq("project_id", id).maybeSingle(),
    supabase.from("components").select("id, component_no, name").order("component_no"),
  ]);

  const productLabel = new Map((products ?? []).map((p) => [p.id, `${p.sku_code} — ${p.model_name}`]));
  const componentLabel = new Map((components ?? []).map((c) => [c.id, `${c.component_no} — ${c.name}`]));

  const { data: costing } = await supabase
    .from("v_project_costing")
    .select("customer_po_value, ordered_value, received_value, consumed_value")
    .eq("project_id", id)
    .maybeSingle();

  const { data: shortfall } = await supabase
    .from("v_project_shortfall")
    .select("component_id, required_qty, ordered_qty, on_hand, shortfall_qty")
    .eq("project_id", id);
  const shortfallRows = (shortfall ?? [])
    .map((s) => ({
      component_id: s.component_id ?? "",
      component_label: s.component_id ? componentLabel.get(s.component_id) ?? "—" : "—",
      required: Number(s.required_qty ?? 0),
      ordered: Number(s.ordered_qty ?? 0),
      on_hand: Number(s.on_hand ?? 0),
      shortfall: Number(s.shortfall_qty ?? 0),
    }))
    .sort((a, b) => b.shortfall - a.shortfall);

  const paramsByProduct: Record<string, VariantParam[]> = {};
  for (const p of vparams ?? []) {
    (paramsByProduct[p.product_id] ??= []).push({
      name: p.name,
      input_type: p.input_type,
      options: (p.options as (string | number)[] | null) ?? null,
      min_value: p.min_value,
      max_value: p.max_value,
      uom: p.uom,
    });
  }

  const liRows = (lineItems ?? []).map((li) => ({
    id: li.id,
    product_label: productLabel.get(li.product_id) ?? "—",
    variant_text: variantText(li.variant_selections),
    quantity: li.quantity,
  }));

  let bomLines: { id: string; component_label: string; required_qty: number; source: string; note: string | null }[] = [];
  const plannedByComponent = new Map<string, number>();
  if (bom) {
    const { data: lines } = await supabase
      .from("bom_lines")
      .select("id, component_id, required_qty, source, note")
      .eq("bom_id", bom.id)
      .order("source");
    bomLines = (lines ?? []).map((l) => ({
      id: l.id,
      component_label: l.component_id ? componentLabel.get(l.component_id) ?? "—" : "—",
      required_qty: l.required_qty,
      source: l.source,
      note: l.note,
    }));
    for (const l of lines ?? []) {
      if (!l.component_id) continue;
      plannedByComponent.set(l.component_id, (plannedByComponent.get(l.component_id) ?? 0) + Number(l.required_qty ?? 0));
    }
  }

  // Materials issued: actual consumption (stock_movements, via v_project_consumption) vs the
  // planned BOM — surfaces anything scanned/issued that isn't even in the plan.
  const { data: consumption } = await supabase
    .from("v_project_consumption")
    .select("component_id, consumed_qty")
    .eq("project_id", id);
  const issuedByComponent = new Map<string, number>();
  for (const c of consumption ?? []) {
    if (!c.component_id) continue;
    issuedByComponent.set(c.component_id, Number(c.consumed_qty ?? 0));
  }
  const issuedComponentIds = new Set([...plannedByComponent.keys(), ...issuedByComponent.keys()]);
  const issuedRows = [...issuedComponentIds]
    .map((cid) => ({
      component_id: cid,
      component_label: componentLabel.get(cid) ?? "—",
      planned: plannedByComponent.get(cid) ?? 0,
      issued: issuedByComponent.get(cid) ?? 0,
      in_plan: plannedByComponent.has(cid),
    }))
    .sort((a, b) => (a.in_plan === b.in_plan ? a.component_label.localeCompare(b.component_label) : a.in_plan ? 1 : -1));

  // Stock status per BOM component: blocked (mine) / available (open, untagged
  // or mine) / issued to another project / out of stock.
  const plannedComponentIds = [...plannedByComponent.keys()];
  const { data: statusLots } = plannedComponentIds.length
    ? await supabase
        .from("inventory_lots")
        .select("component_id, qty_on_hand, status, project_id")
        .in("component_id", plannedComponentIds)
        .neq("status", "consumed")
        .gt("qty_on_hand", 0)
    : { data: [] };

  const otherProjectIds = [...new Set((statusLots ?? [])
    .filter((l) => l.project_id && l.project_id !== id)
    .map((l) => l.project_id as string))];
  const { data: otherProjects } = otherProjectIds.length
    ? await supabase.from("projects").select("id, project_no").in("id", otherProjectIds)
    : { data: [] };
  const otherProjectNo = new Map((otherProjects ?? []).map((p) => [p.id, p.project_no]));

  const stockStatusRows: StockStatusRow[] = plannedComponentIds
    .map((cid) => {
      const required = plannedByComponent.get(cid) ?? 0;
      const lots = (statusLots ?? []).filter((l) => l.component_id === cid);
      const blockedMine = lots
        .filter((l) => l.status === "issued" && l.project_id === id)
        .reduce((s, l) => s + Number(l.qty_on_hand ?? 0), 0);
      const openAvailable = lots
        .filter((l) => l.status === "open" && (l.project_id === null || l.project_id === id))
        .reduce((s, l) => s + Number(l.qty_on_hand ?? 0), 0);
      const elsewhereMap = new Map<string, number>();
      for (const l of lots) {
        if (l.status === "issued" && l.project_id && l.project_id !== id) {
          const label = otherProjectNo.get(l.project_id) ?? "—";
          elsewhereMap.set(label, (elsewhereMap.get(label) ?? 0) + Number(l.qty_on_hand ?? 0));
        }
      }
      const elsewhere = [...elsewhereMap.entries()].map(([project_no, qty]) => ({ project_no, qty }));

      let status: StockStatusRow["status"];
      if (blockedMine >= required) status = "blocked";
      else if (blockedMine + openAvailable >= required) status = "available";
      else if (elsewhere.length > 0) status = "issued_elsewhere";
      else status = "out_of_stock";

      return {
        component_id: cid,
        component_label: componentLabel.get(cid) ?? "—",
        required,
        blocked_mine: blockedMine,
        open_available: openAvailable,
        elsewhere,
        status,
      };
    })
    .sort((a, b) => a.component_label.localeCompare(b.component_label));

  return (
    <div>
      <Link href="/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All projects
      </Link>
      <PageHeader
        title={project.project_no}
        description={customer?.name ?? undefined}
        action={<Badge variant="secondary">{project.status}</Badge>}
      />

      <PhaseBanner
        projectId={id}
        status={project.status}
        lineItemCount={liRows.length}
        bom={bom ?? null}
        hasShortfall={shortfallRows.some((r) => r.shortfall > 0)}
        canWrite={canWrite}
      />

      <Card className="mb-8">
        <CardContent className="grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-4">
          <Info label="Order date" value={formatDate(project.order_date)} />
          <Info label="Delivery date" value={formatDate(project.delivery_date)} />
          <Info label="Customer PO" value={project.customer_po_number || "—"} />
          {canSeeFinancials(profile?.role) && (
            <Info label="PO value" value={formatINR(project.customer_po_value)} />
          )}
        </CardContent>
      </Card>

      {canSeeFinancials(profile?.role) && costing && (
        <Card className="mb-8">
          <CardContent className="grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-5">
            <Info label="Customer PO" value={formatINR(costing.customer_po_value)} />
            <Info label="Ordered" value={formatINR(costing.ordered_value)} />
            <Info label="Received" value={formatINR(costing.received_value)} />
            <Info label="Consumed" value={formatINR(costing.consumed_value)} />
            <Info label="Yet to consume" value={formatINR(Math.max(Number(costing.received_value ?? 0) - Number(costing.consumed_value ?? 0), 0))} />
          </CardContent>
        </Card>
      )}

      <section id="line-items" className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Line items (model + variant)
        </h2>
        <LineItemEditor
          projectId={id}
          products={products ?? []}
          paramsByProduct={paramsByProduct}
          lineItems={liRows}
          canWrite={canWrite}
          addAction={addLineItem}
          removeAction={removeLineItem}
        />
      </section>

      <section id="bom">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Bill of Materials
        </h2>
        <BomPanel
          projectId={id}
          bom={bom ?? null}
          lines={bomLines}
          components={components ?? []}
          canWrite={canWrite}
          generateAction={generateBom}
          approveAction={approveBom}
          unapproveAction={unapproveBom}
          addManualAction={addManualBomLine}
          removeLineAction={removeBomLine}
        />
      </section>

      <section id="stock-status" className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Stock status &amp; blocking
        </h2>
        <StockStatusPanel
          projectId={id}
          bomId={bom?.id ?? null}
          bomApproved={bom?.status === "approved"}
          rows={stockStatusRows}
          canWrite={canWrite}
          blockAction={blockStockForBom}
        />
      </section>

      <section id="issued" className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Materials issued
        </h2>
        <IssuedPanel rows={issuedRows} />
      </section>

      <section id="shortfall" className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Stock check &amp; shortfall
        </h2>
        <ShortfallPanel projectId={id} rows={shortfallRows} canProcure={canWrite} />
      </section>
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
