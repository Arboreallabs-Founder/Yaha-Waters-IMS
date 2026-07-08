/**
 * Imports real operational data from Context/ into Supabase.
 *   npm run import
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local. Idempotent (safe to re-run).
 */
import { adminClient } from "./_client";
import { importPoStatus } from "./import-po-status";

async function main() {
  const supa = adminClient();

  console.log("\n▶ Importing PO Status workbook (vendors, components, customers, projects, POs)…");
  const res = await importPoStatus(supa);
  console.table(res);

  console.log(
    "\nNotes:\n" +
      `  • ${res.skippedPhone} row(s) had no PO Number (phone/forgotten orders) — not auto-imported as POs.\n` +
      "  • BOM template lines need the founder's annotated 'yellow' template — not in Context/ yet.\n" +
      "  • Products + variant params were seeded from the catalogue separately.\n",
  );
  console.log("✅ Import complete.\n");
}

main().catch((e) => {
  console.error("\nImport failed:", e?.message ?? e, "\n");
  process.exit(1);
});
