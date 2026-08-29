import "server-only";
import { createClient } from "@/lib/supabase/server";

export type DocumentType = "po" | "grn" | "job_work";

export type SigningState = {
  requiredSlots: number[];
  signed: { slot: number; user_id: string; signed_at: string; signer_name: string | null; image_data_url: string }[];
  fullySigned: boolean;
  canSignNow: boolean;
  nextSlot: number | null;
  /** Name of whoever needs to sign next (the creator for slot 1, the configured approver otherwise) — so admins/creators can see exactly who a document is stuck on, not just that it's stuck. */
  nextSignerName: string | null;
  /** Whether the document can be printed right now — same as fullySigned, except grandfathered pre-launch GRNs stay printable even while unsigned. */
  printable: boolean;
  /** Slot 1 is missing but this document already moved on without it (grandfathered, or a PO/Job-Work already sent/dispatched before this feature existed) — the creator can still add it for the record via backfill_signature, with no status/dispatch effect. */
  isBackfill: boolean;
};

/**
 * The moment the digital-signature feature went live. GRNs created before
 * this print without requiring a signature — there's no "already sent"
 * status to grandfather against, unlike PO/Job-Work, so printing would
 * otherwise become permanently blocked for old records whose creator may no
 * longer be reachable to sign them. The creator can still add their
 * signature after the fact (backfill_signature) — it just isn't required to
 * print.
 */
const SIGNATURE_FEATURE_LAUNCH = "2026-08-24T13:08:30Z";
const GRANDFATHERED_TYPES: DocumentType[] = ["grn"];

/** Server-side signing-chain state for one document — who's signed, who's next, and whether the current user can sign now. */
export async function getSigningState(
  documentType: DocumentType,
  documentId: string,
  creatorId: string | null,
  actorId: string | null,
  documentCreatedAt?: string | null,
): Promise<SigningState> {
  const grandfathered =
    !!documentCreatedAt &&
    GRANDFATHERED_TYPES.includes(documentType) &&
    new Date(documentCreatedAt) < new Date(SIGNATURE_FEATURE_LAUNCH);
  const supabase = await createClient();
  const [{ data: rights }, { data: sigsRaw }] = await Promise.all([
    supabase.from("approval_rights").select("approver_order, user_id").eq("document_type", documentType),
    supabase
      .from("document_signatures")
      .select("slot, user_id, signed_at, signature_image_data_url")
      .eq("document_type", documentType)
      .eq("document_id", documentId)
      .order("slot"),
  ]);

  const requiredSlots = [...new Set([1, ...(rights ?? []).map((r) => r.approver_order)])].sort((a, b) => a - b);
  const rightsByOrder = new Map((rights ?? []).map((r) => [r.approver_order, r.user_id]));

  const signedSlots = new Set((sigsRaw ?? []).map((s) => s.slot));
  const nextSlot = requiredSlots.find((s) => !signedSlots.has(s)) ?? null;
  const fullySigned = nextSlot === null;
  const nextSignerId = nextSlot === null ? null : nextSlot === 1 ? creatorId : rightsByOrder.get(nextSlot) ?? null;

  const signerIds = [...new Set([...(sigsRaw ?? []).map((s) => s.user_id), ...(nextSignerId ? [nextSignerId] : [])])];
  const { data: profiles } = signerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", signerIds)
    : { data: [] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const signed = (sigsRaw ?? []).map((s) => ({
    slot: s.slot,
    user_id: s.user_id,
    signed_at: s.signed_at,
    signer_name: nameById.get(s.user_id) ?? null,
    image_data_url: s.signature_image_data_url,
  }));

  let canSignNow = false;
  if (nextSlot !== null && actorId) {
    canSignNow = nextSlot === 1 ? actorId === creatorId : actorId === rightsByOrder.get(nextSlot);
  }

  return {
    requiredSlots,
    signed,
    fullySigned,
    canSignNow,
    nextSlot,
    nextSignerName: nextSignerId ? nameById.get(nextSignerId) ?? null : null,
    printable: fullySigned || grandfathered,
    isBackfill: !fullySigned && grandfathered,
  };
}

/**
 * Batched sibling of `getSigningState` for list views (e.g. a "pending
 * approval" tab) — one query on `approval_rights` + one on
 * `document_signatures` for the whole set, instead of a round trip per
 * document.
 */
export async function getSigningStatesBatch(
  documentType: DocumentType,
  docs: { id: string; created_by: string | null }[],
  actorId: string | null,
): Promise<Map<string, { fullySigned: boolean; canSignNow: boolean }>> {
  const result = new Map<string, { fullySigned: boolean; canSignNow: boolean }>();
  if (!actorId || docs.length === 0) return result;

  const supabase = await createClient();
  const [{ data: rights }, { data: sigsRaw }] = await Promise.all([
    supabase.from("approval_rights").select("approver_order, user_id").eq("document_type", documentType),
    supabase
      .from("document_signatures")
      .select("document_id, slot")
      .eq("document_type", documentType)
      .in("document_id", docs.map((d) => d.id)),
  ]);

  const requiredSlots = [...new Set([1, ...(rights ?? []).map((r) => r.approver_order)])].sort((a, b) => a - b);
  const rightsByOrder = new Map((rights ?? []).map((r) => [r.approver_order, r.user_id]));

  const signedSlotsByDoc = new Map<string, Set<number>>();
  for (const s of sigsRaw ?? []) {
    const set = signedSlotsByDoc.get(s.document_id) ?? new Set<number>();
    set.add(s.slot);
    signedSlotsByDoc.set(s.document_id, set);
  }

  for (const doc of docs) {
    const signedSlots = signedSlotsByDoc.get(doc.id) ?? new Set<number>();
    const nextSlot = requiredSlots.find((s) => !signedSlots.has(s)) ?? null;
    const fullySigned = nextSlot === null;
    const canSignNow =
      nextSlot !== null &&
      (nextSlot === 1 ? actorId === doc.created_by : actorId === rightsByOrder.get(nextSlot));
    result.set(doc.id, { fullySigned, canSignNow });
  }

  return result;
}
