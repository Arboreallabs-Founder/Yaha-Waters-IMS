import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters, canSeeFinancials } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { CrudManager, type Column, type Field } from "@/components/crud/crud-manager";
import { upsert, remove } from "./actions";

export default async function ComponentsPage() {
  const profile = await getProfile();
  const finance = canSeeFinancials(profile?.role);
  const supabase = await createClient();

  // team_member reads the column-masked safe view (no standard_cost)
  const source = finance ? "components" : "v_components_safe";
  const { data } = await supabase.from(source as "components").select("*").order("component_no");
  const rows = data ?? [];

  const columns: Column[] = [
    { key: "component_no", label: "Component No." },
    { key: "name", label: "Name" },
    { key: "quantity_type", label: "Lot type" },
    { key: "uom", label: "UoM" },
    { key: "type", label: "Type" },
    { key: "is_serialized", label: "Serialized", format: "bool" },
    { key: "reorder_level", label: "Reorder", format: "number" },
    { key: "standard_cost", label: "Std Cost", format: "inr", financial: true },
  ];
  const fields: Field[] = [
    { name: "component_no", label: "Component No.", type: "text", required: true },
    { name: "name", label: "Name", type: "text", required: true },
    {
      name: "quantity_type",
      label: "Lot type",
      type: "select",
      required: true,
      options: [
        { value: "nos", label: "Nos (count)" },
        { value: "length", label: "Length (pipes / rods) — metres" },
        { value: "area", label: "Area (sheets) — sq metres" },
      ],
    },
    { name: "uom", label: "UoM display label", type: "text", placeholder: "Nos, Mtr, Sq.Mtr, Kg…" },
    { name: "type", label: "Category", type: "text", placeholder: "Nozzle, Fastener, Media…" },
    { name: "reorder_level", label: "Reorder level", type: "number", step: "any" },
    { name: "standard_cost", label: "Standard cost (₹)", type: "number", step: "any", financial: true },
    { name: "is_serialized", label: "Serialized (1 lot = 1 unit)", type: "checkbox" },
    { name: "description", label: "Description", type: "textarea" },
  ];

  return (
    <div>
      <PageHeader
        title="Components"
        description="The component master — the “component numbers” that BOM lines, POs and inventory lots reference."
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
        searchKeys={["component_no", "name", "type"]}
      />
    </div>
  );
}
