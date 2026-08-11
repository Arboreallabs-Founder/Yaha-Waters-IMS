import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { UsersManager } from "./users-manager";

export default async function UsersPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const { data: users } = await supabase.rpc("admin_list_users");

  return (
    <div>
      <PageHeader
        title="Users"
        description="Provision sign-ins and assign roles. There is no public signup — accounts are created here."
      />
      <UsersManager users={users ?? []} />
    </div>
  );
}
