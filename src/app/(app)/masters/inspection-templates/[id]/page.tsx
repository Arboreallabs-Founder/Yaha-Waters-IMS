import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TemplateFieldEditor, type TemplateField } from "./template-field-editor";
import { upsertTemplateField, removeTemplateField } from "../actions";

export default async function InspectionTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const supabase = await createClient();

  const { data: template } = await supabase.from("inspection_templates").select("*").eq("id", id).single();
  if (!template) notFound();

  const [{ data: fields }, { data: components }] = await Promise.all([
    supabase.from("inspection_template_fields").select("*").eq("template_id", id).order("sort_order"),
    supabase.from("components").select("component_no, name").eq("inspection_template_id", id).order("component_no"),
  ]);

  const rows: TemplateField[] = (fields ?? []).map((f) => ({
    id: f.id,
    label: f.label,
    field_type: f.field_type,
    options: (f.options as string[] | null) ?? null,
    is_required: f.is_required,
    is_active: f.is_active,
    sort_order: f.sort_order,
  }));

  return (
    <div>
      <Link href="/masters/inspection-templates" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All templates
      </Link>
      <PageHeader
        title={template.name}
        description={template.description ?? undefined}
        action={template.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
      />

      <Card className="mb-6">
        <CardContent className="p-5 text-sm">
          <p className="font-medium">Used by {(components ?? []).length} component(s)</p>
          <p className="mt-0.5 text-muted-foreground">
            {(components ?? []).length === 0
              ? "Attach this template to a component in Masters → Components (\"Inspection template\" field)."
              : (components ?? []).map((c) => `${c.component_no} — ${c.name}`).join(", ")}
          </p>
        </CardContent>
      </Card>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Fields</h2>
      <TemplateFieldEditor
        templateId={id}
        fields={rows}
        canWrite={canWriteMasters(profile?.role)}
        upsertAction={upsertTemplateField}
        removeAction={removeTemplateField}
      />
    </div>
  );
}
