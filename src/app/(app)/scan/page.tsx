import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Scanner } from "./scanner";

export default async function ScanPage() {
  const profile = await getProfile();
  const canManage = profile?.role === "admin" || profile?.role === "team_lead";
  const supabase = await createClient();
  const { data: projects } = await supabase.from("projects").select("id, project_no").order("project_no");

  return (
    <div>
      <PageHeader
        title="Scan"
        description="Scan a lot's QR (or type its code) to consume into a project, stock-take, or transfer. Quantity is always read live from the system."
      />
      <Scanner projects={projects ?? []} canManage={canManage} />
    </div>
  );
}
