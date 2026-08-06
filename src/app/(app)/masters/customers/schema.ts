import { z } from "zod";
import { COUNTRY_CODE_BY_ISO2, phoneDigitRange } from "@/lib/country-codes";

export const customerFormSchema = z
  .object({
    name: z.string().trim().min(1, "Customer name is required."),
    email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address."),
    phone_country_code: z
      .string()
      .trim()
      .min(1, "Country code is required.")
      .refine((iso2) => iso2 in COUNTRY_CODE_BY_ISO2, "Select a valid country code."),
    phone_number: z
      .string()
      .trim()
      .min(1, "Phone number is required.")
      .regex(/^\d+$/, "Phone number must contain digits only."),
    gst_no: z.string().trim().min(1, "GST No. is required."),
    registered_address: z.string().trim().min(1, "Registered address is required."),
    delivery_address: z.string().trim().min(1, "Delivery address is required."),
  })
  .superRefine((val, ctx) => {
    const { min, max } = phoneDigitRange(val.phone_country_code);
    const len = val.phone_number.length;
    if (len < min || len > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone_number"],
        message:
          min === max
            ? `Phone number must be exactly ${min} digits for the selected country.`
            : `Phone number must be ${min}-${max} digits for the selected country.`,
      });
    }
  });

export type CustomerFormValues = z.infer<typeof customerFormSchema>;

/**
 * Pre-submit transform: when "delivery same as registered" is checked,
 * copy registered_address into delivery_address BEFORE validation runs, so
 * the (still-required) delivery_address field validates as non-empty. The
 * checkbox state itself is never persisted — only its effect on the copied
 * value is.
 */
export function applySameAsRegistered<
  T extends { registered_address: string; delivery_address: string },
>(values: T, sameAsRegistered: boolean): T {
  if (!sameAsRegistered) return values;
  return { ...values, delivery_address: values.registered_address };
}
