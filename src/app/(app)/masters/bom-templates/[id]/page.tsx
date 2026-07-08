import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TemplateLineEditor, type Line } from "./template-line-editor";
import { upsertTemplateLine, removeTemplateLine } from "../actions";

export default async function BomTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const supabase = await createClient();

  const { data: template } = await supabase.from("bom_templates").select("*").eq("id", id).single();
  if (!template) notFound();

  const [{ data: product }, { data: lines }, { data: components }, { data: vparams }] = await Promise.all([
    supabase.from("products").select("sku_code, model_name").eq("id", template.product_id).single(),
    supabase.from("bom_template_lines").select("*").eq("bom_template_id", id).order("note", { nullsFirst: false }),
    supabase.from("components").select("id, component_no, name").order("component_no"),
    supabase
      .from("product_variant_params")
      .select("name, input_type, options")
      .eq("product_id", template.product_id)
      .order("sort_order"),
  ]);

  const compById = new Map((components ?? []).map((c) => [c.id, `${c.component_no} — ${c.name}`]));

  const rows: Line[] = (lines ?? []).map((l) => ({
    id: l.id,
    component_id: l.component_id,
    component_label: l.component_id ? compById.get(l.component_id) ?? "—" : "(variant-driven)",
    quantity: l.quantity,
    is_variant_driven: l.is_variant_driven,
    variant_rule: l.variant_rule,
    note: l.note,
  }));

  const dropdownParams = (vparams ?? [])
    .filter((p) => p.input_type === "dropdown" && Array.isArray(p.options))
    .map((p) => ({ name: p.name, options: p.options as (string | number)[] }));

  const commonCount = rows.filter((r) => !r.is_variant_driven).length;
  const variantCount = rows.filter((r) => r.is_variant_driven).length;

  return (
    <div>
      <Link href="/masters/bom-templates" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All templates
      </Link>
      <PageHeader
        title={product ? `${product.sku_code} — ${product.model_name}` : "BOM Template"}
        description={`Version ${template.version}${template.is_active ? " (active)" : ""}`}
      />

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-6 p-5 text-sm">
          <Stat label="Total lines" value={rows.length} />
          <Stat label="Common" value={commonCount} />
          <Stat label="Variant-driven" value={variantCount} />
          <div className="ml-auto">
            {template.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
          </div>
        </CardContent>
      </Card>

      {rows.length === 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">BOM template is empty</p>
            <p className="mt-0.5 text-amber-700">
              No lines have been added yet. Use the editor below to add common and variant-driven components for this product.
            </p>
          </div>
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Template lines</h2>
      <TemplateLineEditor
        templateId={id}
        lines={rows}
        components={components ?? []}
        dropdownParams={dropdownParams}
        canWrite={canWriteMasters(profile?.role)}
        upsertAction={upsertTemplateLine}
        removeAction={removeTemplateLine}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
    </div>
  );
}
