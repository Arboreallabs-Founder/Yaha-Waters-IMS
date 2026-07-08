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
import { ShortfallPanel } from "./shortfall-panel";
import { ScheduleEditor } from "./schedule-editor";
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

  const [{ data: activities }, { data: schedule }] = await Promise.all([
    supabase.from("project_activities").select("*").eq("project_id", id).order("sort_order"),
    supabase.from("v_project_schedule").select("po_released, material_ready").eq("project_id", id).maybeSingle(),
  ]);

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
  }

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

      <section id="shortfall" className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Stock check &amp; shortfall
        </h2>
        <ShortfallPanel projectId={id} rows={shortfallRows} canProcure={canWrite} />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Production schedule
        </h2>
        <ScheduleEditor
          projectId={id}
          activities={activities ?? []}
          poReleased={!!schedule?.po_released}
          materialReady={!!schedule?.material_ready}
          canWrite={canWrite}
        />
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
