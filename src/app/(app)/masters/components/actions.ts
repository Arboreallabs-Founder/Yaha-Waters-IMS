"use server";

import { upsertRecord, deleteRecord, type ActionResult } from "@/lib/server/crud";

const FIELDS = {
  component_no: "string",
  name: "string",
  description: "string",
  uom: "string",
  type: "string",
  quantity_type: "string",
  is_serialized: "boolean",
  reorder_level: "number",
  standard_cost: "number",
} as const;

export async function upsert(fd: FormData): Promise<ActionResult> {
  return upsertRecord("components", FIELDS, fd);
}
export async function remove(fd: FormData): Promise<ActionResult> {
  return deleteRecord("components", fd);
}
