"use server";

import { upsertRecord, deleteRecord, type ActionResult } from "@/lib/server/crud";

const FIELDS = { name: "string", description: "string", parent_id: "string" } as const;

export async function upsert(fd: FormData): Promise<ActionResult> {
  return upsertRecord("categories", FIELDS, fd);
}
export async function remove(fd: FormData): Promise<ActionResult> {
  return deleteRecord("categories", fd);
}
