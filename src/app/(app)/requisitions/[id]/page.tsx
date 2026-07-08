import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { RequisitionEditor } from "./requisition-editor";

export default async function RequisitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const role = profile?.role;
  const canProcure = role === "admin" || role === "team_lead";
  const canRequest = canProcure || role === "team_member";
  const supabase = await createClient();

  const { data: req } = await supabase.from("requisitions").select("*").eq("id", id).single();
  if (!req) notFound();

  const [{ data: lines }, { data: components }, project] = await Promise.all([
    supabase.from("requisition_lines").select("*").eq("requisition_id", id).order("created_at"),
    supabase.from("components").select("id, component_no, name").order("component_no"),
    req.project_id
      ? supabase.from("projects").select("project_no").eq("id", req.project_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const compLabel = new Map((components ?? []).map((c) => [c.id, `${c.component_no} — ${c.name}`]));
  const lineRows = (lines ?? []).map((l) => ({
    id: l.id,
    component_label: l.component_id ? compLabel.get(l.component_id) ?? "—" : "—",
    qty: l.qty,
  }));

  return (
    <div>
      <Link href="/requisitions" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All requisitions
      </Link>
      <PageHeader title={req.req_no} description={project?.data?.project_no ? `Project ${project.data.project_no}` : "Stock requisition"} />

      <Card className="mb-6">
        <CardContent className="p-5">
          <RequisitionEditor
            requisitionId={id}
            status={req.status}
            lines={lineRows}
            components={components ?? []}
            canProcure={canProcure}
            canRequest={canRequest}
          />
        </CardContent>
      </Card>
    </div>
  );
}
