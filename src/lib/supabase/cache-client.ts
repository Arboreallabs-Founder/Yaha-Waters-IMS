import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * Service-role client for use ONLY inside `unstable_cache`-wrapped reads.
 *
 * `unstable_cache` callbacks must not call `cookies()`/`headers()` (Next.js
 * throws at runtime if they do), so the normal cookie-scoped `createClient()`
 * from `./server` can't be used here. This bypasses RLS instead — safe only
 * because every table read through this client (see src/lib/masters-data.ts)
 * has a `select ... to authenticated using (true)` policy, i.e. identical
 * rows for every authenticated user/role already. Never widen this client's
 * use beyond those specific, verified-row-identical tables, and never import
 * it into anything client-side.
 */
export function createCacheClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}
