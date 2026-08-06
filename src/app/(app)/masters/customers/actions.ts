"use server";

import { upsertRecord, deleteRecord, type ActionResult } from "@/lib/server/crud";
import { customerFormSchema } from "./schema";

const CUSTOMER_FIELDS = {
  name: "string",
  email: "string",
  phone_country_code: "string",
  phone_number: "string",
  gst_no: "string",
  registered_address: "string",
  delivery_address: "string",
} as const;

export async function upsert(fd: FormData): Promise<ActionResult> {
  const parsed = customerFormSchema.safeParse({
    name: fd.get("name"),
    email: fd.get("email"),
    phone_country_code: fd.get("phone_country_code"),
    phone_number: fd.get("phone_number"),
    gst_no: fd.get("gst_no"),
    registered_address: fd.get("registered_address"),
    delivery_address: fd.get("delivery_address"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  return upsertRecord("customers", CUSTOMER_FIELDS, fd);
}
export async function remove(fd: FormData): Promise<ActionResult> {
  return deleteRecord("customers", fd);
}
