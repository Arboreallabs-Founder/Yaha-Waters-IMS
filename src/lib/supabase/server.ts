import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client (RSC, server actions, route handlers).
 *
 * NOTE: queries are intentionally untyped. The generated `database.types.ts`
 * (used for `Profile`/`Role` aliases) currently makes postgrest-js v2 collapse
 * select/update result types to `never`. Schema correctness is enforced by the
 * SQL migrations + advisors. Re-enabling the typed client is a tracked follow-up.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore; middleware refreshes the session.
          }
        },
      },
    },
  );
}
