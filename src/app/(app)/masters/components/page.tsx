import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters, canSeeFinancials } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { CrudManager, type Column, type Field } from "@/components/crud/crud-manager";
import { upsert, remove } from "./actions";

export default async function ComponentsPage() {
  const profile = await getProfile();
  const finance = canSeeFinancials(profile?.role);
  const supabase = await createClient();

  // team_member reads the column-masked safe view (no standard_cost / jw_rate)
  const source = finance ? "components" : "v_components_safe";
  const [{ data }, { data: vendors }, { data: assemblies }] = await Promise.all([
    supabase.from(source as "components").select("*").order("component_no"),
    supabase.from("vendors").select("id, name").order("name"),
    supabase.from(source as "components").select("id, component_no, name").eq("is_assembly", true).order("component_no"),
  ]);
  const vendorOptions = (vendors ?? []).map((v) => ({ value: v.id, label: v.name }));
  const assemblyOptions = (assemblies ?? []).map((a) => ({ value: a.id, label: `${a.component_no} — ${a.name}` }));
  const assemblyLabel = new Map((assemblies ?? []).map((a) => [a.id, `${a.component_no} — ${a.name}`]));

  // enrich rows with a readable sub-assembly label for the list column
  const rows = (data ?? []).map((r) => ({
    ...r,
    parent_assembly_label: r.parent_assembly_id ? assemblyLabel.get(r.parent_assembly_id) ?? "—" : "—",
  }));

  const columns: Column[] = [
    { key: "component_no", label: "Component No." },
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "grade", label: "Grade" },
    { key: "tracking_mode", label: "QR / Lot", format: "badge" },
    { key: "parent_assembly_label", label: "Sub-assembly" },
    { key: "is_assembly", label: "Assembly", format: "bool" },
    { key: "is_job_work", label: "Job Work", format: "bool" },
    { key: "uom", label: "UoM" },
    { key: "standard_cost", label: "Std Cost", format: "inr", financial: true },
  ];

  const fields: Field[] = [
    { name: "component_no", label: "Component No.", type: "text", required: true },
    { name: "name", label: "Name", type: "text", required: true },
    { name: "type", label: "Category", type: "text", placeholder: "Nozzle, Fastener, Media…" },
    { name: "grade", label: "Grade", type: "text", placeholder: "MS, SS316, Brass…" },
    { name: "spec", label: "Spec", type: "text", placeholder: 'e.g. 12", #150' },
    {
      name: "tracking_mode",
      label: "QR / Lot tracking",
      type: "select",
      required: true,
      options: [
        { value: "item", label: "Item — QR per piece" },
        { value: "box", label: "Box — QR on the box (many pieces)" },
        { value: "bulk", label: "Bulk — measured (length / weight / volume)" },
      ],
      help: "How stock of this component is labelled & counted.",
    },
    {
      name: "quantity_type",
      label: "Quantity type",
      type: "select",
      required: true,
      options: [
        { value: "nos", label: "Nos (count)" },
        { value: "length", label: "Length (pipes / rods) — metres" },
        { value: "area", label: "Area (sheets) — sq metres" },
      ],
    },
    { name: "uom", label: "UoM display label", type: "text", placeholder: "Nos, Mtr, Kg, Ltr…" },
    { name: "nominal_size", label: "Nominal size", type: "text", placeholder: '2", 1/4" x 1/4"…' },
    { name: "od_mm", label: "OD (mm)", type: "number", step: "any" },
    { name: "id_mm", label: "ID (mm)", type: "number", step: "any" },
    { name: "thk_mm", label: "Thickness (mm)", type: "number", step: "any" },
    { name: "width_mm", label: "Width (mm)", type: "number", step: "any" },
    { name: "length_mm", label: "Length (mm)", type: "number", step: "any" },
    { name: "by_weight", label: "Priced / issued by weight", type: "checkbox" },
    { name: "weight_uom", label: "Weight UoM", type: "text", placeholder: "Kg" },
    { name: "cut_from_plate", label: "Cut from plate", type: "checkbox" },
    { name: "parent_assembly_id", label: "Sub-assembly", type: "select", options: assemblyOptions, help: "Which sub-assembly this component belongs to." },
    { name: "is_assembly", label: "Assembly (stockable sub-BOM)", type: "checkbox" },
    { name: "is_serialized", label: "Serialized (1 lot = 1 unit)", type: "checkbox" },
    { name: "reorder_level", label: "Reorder level", type: "number", step: "any" },
    { name: "standard_cost", label: "Standard cost (₹)", type: "number", step: "any", financial: true },
    // ---- job work ----
    { name: "is_job_work", label: "Job Work component (raw → finished)", type: "checkbox" },
    { name: "raw_supplier_id", label: "Raw supplier", type: "select", options: vendorOptions, help: "Vendor the raw form is bought from." },
    { name: "jw_vendor_id", label: "Job-work vendor", type: "select", options: vendorOptions, help: "Vendor that finishes the raw into the completed part." },
    { name: "jw_rate", label: "Job-work rate (₹ / unit)", type: "number", step: "any", financial: true },
    { name: "description", label: "Description", type: "textarea" },
  ];

  return (
    <div>
      <PageHeader
        title="Components"
        description="The component master — component numbers that BOM lines, POs and inventory lots reference. Includes attributes, vendor tags, job-work and QR/lot tracking."
      />
      <CrudManager
        title="Components"
        entityName="component"
        rows={rows}
        columns={columns}
        fields={fields}
        upsertAction={upsert}
        deleteAction={remove}
        canWrite={canWriteMasters(profile?.role)}
        canSeeFinancials={finance}
        searchKeys={["component_no", "name", "type", "grade"]}
      />
    </div>
  );
}
