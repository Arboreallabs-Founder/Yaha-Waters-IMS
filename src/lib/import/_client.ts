import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

/** Service-role client for import scripts (bypasses RLS). Never ship to the browser. */
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "\n  Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.\n" +
        "  Get the service_role key from Supabase dashboard → Project Settings → API.\n",
    );
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export const CONTEXT_DIR = "Context";
export const PO_STATUS_FILE = "01 YWSPL_PO_Status_2026-2027_16.06.2026.xlsx";
export const PRODUCT_MASTER_FILE = "Product Master List.xls";
export const PROJECT_SCHEDULE_FILE = "Project Schedule_11.06.2026.xlsx";
