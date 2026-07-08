import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters, canSeeFinancials } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { CrudManager, type Column, type Field } from "@/components/crud/crud-manager";
import { upsert, remove } from "./actions";

export default async function VendorsPage() {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("vendors").select("*").order("name");
  const rows = data ?? [];

  const columns: Column[] = [
    { key: "name", label: "Vendor" },
    { key: "gst_no", label: "GST No." },
    { key: "contact", label: "Contact" },
    { key: "avg_lead_time_days", label: "Lead (days)", format: "number" },
    { key: "rating", label: "Rating", format: "number" },
    { key: "is_active", label: "Active", format: "bool" },
  ];
  const fields: Field[] = [
    { name: "name", label: "Vendor name", type: "text", required: true },
    { name: "gst_no", label: "GST No.", type: "text" },
    { name: "contact", label: "Contact", type: "text" },
    { name: "avg_lead_time_days", label: "Avg lead time (days)", type: "number" },
    { name: "rating", label: "Rating (0–5)", type: "number", step: "any" },
    { name: "is_active", label: "Active", type: "checkbox", defaultChecked: true },
    { name: "address", label: "Address", type: "textarea" },
  ];

  return (
    <div>
      <PageHeader
        title="Vendors"
        description="Suppliers. Open a vendor to map which components they supply (powers phone-order matching)."
      />
      <CrudManager
        title="Vendors"
        entityName="vendor"
        rows={rows}
        columns={columns}
        fields={fields}
        upsertAction={upsert}
        deleteAction={remove}
        canWrite={canWriteMasters(profile?.role)}
        canSeeFinancials={canSeeFinancials(profile?.role)}
        searchKeys={["name", "gst_no", "contact"]}
        detailBase="/masters/vendors"
      />
    </div>
  );
}
