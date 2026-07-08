"use server";

import { upsertRecord, deleteRecord, type ActionResult } from "@/lib/server/crud";

const VENDOR_FIELDS = {
  name: "string",
  gst_no: "string",
  contact: "string",
  address: "string",
  avg_lead_time_days: "number",
  rating: "number",
  is_active: "boolean",
} as const;

export async function upsert(fd: FormData): Promise<ActionResult> {
  return upsertRecord("vendors", VENDOR_FIELDS, fd);
}
export async function remove(fd: FormData): Promise<ActionResult> {
  return deleteRecord("vendors", fd);
}

// ---- vendor_components (who supplies what) ----
const VC_FIELDS = {
  vendor_id: "string",
  component_id: "string",
  vendor_part_code: "string",
  price: "number",
  lead_time_days: "number",
} as const;

export async function upsertVendorComponent(fd: FormData): Promise<ActionResult> {
  return upsertRecord("vendor_components", VC_FIELDS, fd);
}
export async function removeVendorComponent(fd: FormData): Promise<ActionResult> {
  return deleteRecord("vendor_components", fd);
}
