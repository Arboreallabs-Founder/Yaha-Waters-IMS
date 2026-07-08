import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { FgManager } from "./fg-manager";

function variantText(sel: unknown): string {
  if (!sel || typeof sel !== "object") return "";
  return Object.entries(sel as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join(", ");
}

export default async function FinishedGoodsPage() {
  const profile = await getProfile();
  const canWrite = canWriteMasters(profile?.role); // admin / team_lead
  const supabase = await createClient();

  const [{ data: fgs }, { data: products }, { data: lineItems }, { data: projects }] = await Promise.all([
    supabase.from("finished_goods").select("*").order("created_at", { ascending: false }),
    supabase.from("products").select("id, sku_code, model_name").order("sku_code"),
    supabase.from("project_line_items").select("id, project_id, product_id, variant_selections"),
    supabase.from("projects").select("id, project_no"),
  ]);

  const prodLabel = new Map((products ?? []).map((p) => [p.id, `${p.sku_code} — ${p.model_name}`]));
  const projNo = new Map((projects ?? []).map((p) => [p.id, p.project_no]));

  const units = (fgs ?? []).map((u) => ({
    id: u.id,
    serial_no: u.serial_no,
    product_label: u.product_id ? prodLabel.get(u.product_id) ?? "—" : "—",
    status: u.status,
    variant_text: variantText(u.variant_selections),
    created_at: u.created_at,
  }));

  const lineItemOpts = (lineItems ?? []).map((li) => ({
    id: li.id,
    label: `${li.project_id ? projNo.get(li.project_id) ?? "—" : "—"} · ${li.product_id ? prodLabel.get(li.product_id) ?? "—" : "—"}${variantText(li.variant_selections) ? ` (${variantText(li.variant_selections)})` : ""}`,
  }));

  return (
    <div>
      <PageHeader title="Finished Goods" description="Completed units with a serial QR. Status: in production → ready → dispatched." />
      <FgManager
        units={units}
        products={(products ?? []).map((p) => ({ id: p.id, label: `${p.sku_code} — ${p.model_name}` }))}
        lineItems={lineItemOpts}
        canWrite={canWrite}
      />
    </div>
  );
}
