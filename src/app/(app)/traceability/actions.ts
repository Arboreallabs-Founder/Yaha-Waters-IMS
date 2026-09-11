"use server";

import { getLotTraceability } from "@/lib/server/traceability";

export type ActionResult = { ok?: true; error?: string; data?: unknown };

/**
 * Scanner entry point. The fetch itself lives in `@/lib/server/traceability` so
 * the `[lotCode]` route can share it without going through a server action.
 *
 * The try/catch belongs here rather than in the helper: the scanner shows errors
 * as inline text beside the camera, whereas the route wants a thrown error to
 * reach `error.tsx`.
 */
export async function lookupTraceability(lotCode: string): Promise<ActionResult> {
  if (!lotCode.trim()) return { error: "Enter or scan a lot code." };
  try {
    const data = await getLotTraceability(lotCode);
    return data ? { ok: true, data } : { error: "Lot not found" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lookup failed." };
  }
}
