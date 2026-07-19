"use server";

import { upsertRecord, deleteRecord, type ActionResult } from "@/lib/server/crud";

const FIELDS = {
  component_no: "string",
  name: "string",
  description: "string",
  type: "string",
  grade: "string",
  spec: "string",
  uom: "string",
  quantity_type: "string",
  tracking_mode: "string",
  nominal_size: "string",
  od_mm: "number",
  id_mm: "number",
  thk_mm: "number",
  width_mm: "number",
  length_mm: "number",
  by_weight: "boolean",
  weight_uom: "string",
  cut_from_plate: "boolean",
  is_assembly: "boolean",
  parent_assembly_id: "string",
  is_serialized: "boolean",
  reorder_level: "number",
  standard_cost: "number",
  // job work
  is_job_work: "boolean",
  raw_supplier_id: "string",
  jw_vendor_id: "string",
  jw_rate: "number",
} as const;

export async function upsert(fd: FormData): Promise<ActionResult> {
  return upsertRecord("components", FIELDS, fd);
}
export async function remove(fd: FormData): Promise<ActionResult> {
  return deleteRecord("components", fd);
}
