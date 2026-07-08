"use server";

import { upsertRecord, deleteRecord, type ActionResult } from "@/lib/server/crud";

const CUSTOMER_FIELDS = {
  name: "string",
  contact: "string",
  gst_no: "string",
  address: "string",
} as const;

export async function upsert(fd: FormData): Promise<ActionResult> {
  return upsertRecord("customers", CUSTOMER_FIELDS, fd);
}
export async function remove(fd: FormData): Promise<ActionResult> {
  return deleteRecord("customers", fd);
}
