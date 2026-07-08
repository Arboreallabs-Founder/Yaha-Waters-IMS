import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { CrudManager, type Column, type Field } from "@/components/crud/crud-manager";
import { upsert, remove } from "./actions";

export default async function CustomersPage() {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("customers").select("*").order("name");
  const rows = data ?? [];

  const columns: Column[] = [
    { key: "name", label: "Customer" },
    { key: "contact", label: "Contact" },
    { key: "gst_no", label: "GST No." },
    { key: "address", label: "Address" },
  ];

  const fields: Field[] = [
    { name: "name", label: "Customer name", type: "text", required: true },
    { name: "contact", label: "Contact (phone / email)", type: "text" },
    { name: "gst_no", label: "GST No.", type: "text" },
    { name: "address", label: "Address", type: "textarea" },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Buyers of YAHA Waters systems. Customers are linked to Projects / Orders."
      />
      <CrudManager
        title="Customers"
        entityName="customer"
        rows={rows}
        columns={columns}
        fields={fields}
        upsertAction={upsert}
        deleteAction={remove}
        canWrite={canWriteMasters(profile?.role)}
        canSeeFinancials={false}
        searchKeys={["name", "contact", "gst_no"]}
      />
    </div>
  );
}
