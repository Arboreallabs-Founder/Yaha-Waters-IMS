// Dumps the migrations applied to the remote Supabase project into versioned
// files under supabase/migrations/. Run with the service-role key:
//   node supabase/dump-migrations.mjs
// (Reads via the service-role-only public.dump_migrations() RPC.)
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local).");
  process.exit(1);
}

const supa = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await supa.rpc("dump_migrations");
if (error) throw error;

const outDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
mkdirSync(outDir, { recursive: true });
for (const m of data) {
  const body = Array.isArray(m.statements) ? m.statements.join("\n\n") : String(m.statements ?? "");
  const file = `${m.version}_${m.name ?? "migration"}.sql`;
  writeFileSync(join(outDir, file), body + "\n");
  console.log("wrote", file);
}
console.log(`Done. ${data.length} migrations dumped.`);
