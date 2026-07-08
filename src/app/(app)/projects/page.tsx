import { createClient } from "@/lib/supabase/server";
import { getProfile, canWriteMasters, canSeeFinancials } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ProjectsList } from "./projects-list";
import { upsert, remove } from "./actions";

export default async function ProjectsPage() {
  const profile = await getProfile();
  const supabase = await createClient();

  const [{ data: projects }, { data: customers }, { data: teams }] = await Promise.all([
    supabase.from("projects").select("*").order("created_at", { ascending: false }),
    supabase.from("customers").select("id, name").order("name"),
    supabase.from("teams").select("id, name").order("name"),
  ]);

  const custById = new Map((customers ?? []).map((c) => [c.id, c.name]));
  const teamById = new Map((teams ?? []).map((t) => [t.id, t.name]));

  const rows = (projects ?? []).map((p) => ({
    ...p,
    customer_name: p.customer_id ? custById.get(p.customer_id) ?? "—" : null,
    team_name: p.team_id ? teamById.get(p.team_id) ?? "—" : null,
  }));

  return (
    <div>
      <PageHeader
        title="Projects / Orders"
        description="Customer orders. Open a project to add line items and generate its BOM."
      />
      <ProjectsList
        projects={rows}
        customers={customers ?? []}
        teams={teams ?? []}
        canWrite={canWriteMasters(profile?.role)}
        canSeeFinancials={canSeeFinancials(profile?.role)}
        upsertAction={upsert}
        deleteAction={remove}
      />
    </div>
  );
}
