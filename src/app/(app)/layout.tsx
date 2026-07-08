import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { logout } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">
            {profile ? "Account deactivated" : "No access yet"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {profile
              ? "Your account has been deactivated. Contact an administrator."
              : "Your sign-in is valid but no profile has been provisioned. Ask an administrator to set up your role and team."}
          </p>
          <form action={logout} className="mt-4">
            <Button variant="outline" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <AppShell fullName={profile.full_name} email={user.email} role={profile.role}>
      {children}
    </AppShell>
  );
}
