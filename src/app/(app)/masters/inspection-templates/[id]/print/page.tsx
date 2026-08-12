import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/print-button";

const OUR = {
  tagline: "Providing Design, Engineering & Manufacturing of Self Cleaning Auto Backwash Filters & Complete Water & Waste Water Treatment Plant.",
  address: "Survey No. 26, Unit No.19, Universal Ind. Estate, Dheku, Sajgaon, Khopoli, Khalapur, District- Raigad : 410203.",
};

type Field = {
  id: string;
  label: string;
  field_type: string;
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
};

export default async function InspectionTemplatePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: template } = await supabase.from("inspection_templates").select("*").eq("id", id).single();
  if (!template) notFound();

  const { data: fields } = await supabase
    .from("inspection_template_fields")
    .select("id, label, field_type, options, is_required, sort_order")
    .eq("template_id", id)
    .eq("is_active", true)
    .order("sort_order");

  const rows = ((fields ?? []) as Field[]).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="mx-auto max-w-4xl bg-white p-6 text-black print:p-0">
      <style>{"@page { size: A4 portrait; margin: 12mm; }"}</style>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={`/masters/inspection-templates/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to template
        </Link>
        <PrintButton label="Print blank template" />
      </div>

      <div className="border border-black text-[10px] leading-tight">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-black p-3">
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/yaha-logo.png" alt="YAHA" className="h-16 w-16 object-contain" />
            <div>
              <p className="text-xl font-extrabold tracking-tight">
                YAHA <span className="font-normal">WATER SYSTEM PVT LTD.</span>
              </p>
              <p className="mt-0.5 max-w-md text-[9px]">{OUR.tagline}</p>
              <p className="text-[9px]">{OUR.address}</p>
            </div>
          </div>
        </div>

        <h1 className="border-b border-black py-2 text-center text-base font-bold">{template.name.toUpperCase()}</h1>
        {template.description ? (
          <p className="border-b border-black p-2 text-[9px] text-black/70">{template.description}</p>
        ) : null}

        {/* Blank header info for hand-fill */}
        <div className="grid grid-cols-3 divide-x divide-black border-b border-black">
          <div className="p-2"><span className="font-semibold">GRN No.:</span> ______________</div>
          <div className="p-2"><span className="font-semibold">Vendor:</span> ______________</div>
          <div className="p-2"><span className="font-semibold">Date:</span> ______________</div>
        </div>

        {/* Fields */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black">
              <th className="w-8 border-r border-black p-1 text-left">Sr.</th>
              <th className="border-r border-black p-1 text-left">Check Point</th>
              <th className="w-40 border-r border-black p-1 text-left">Observation</th>
              <th className="w-24 p-1 text-left">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-3 text-center text-muted-foreground">
                  No fields defined for this template.
                </td>
              </tr>
            ) : (
              rows.map((f, i) => (
                <tr key={f.id} className="border-b border-black/20">
                  <td className="border-r border-black/20 p-2 align-top">{i + 1}</td>
                  <td className="border-r border-black/20 p-2 align-top">
                    {f.label}
                    {f.is_required ? <span className="text-red-600"> *</span> : null}
                  </td>
                  <td className="border-r border-black/20 p-2 align-top">
                    {f.field_type === "checkbox" ? (
                      <div className="flex gap-4">
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block h-3 w-3 border border-black" /> OK
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block h-3 w-3 border border-black" /> NOT OK
                        </span>
                      </div>
                    ) : f.field_type === "choice" ? (
                      <div className="flex flex-wrap gap-3">
                        {(f.options ?? []).map((opt) => (
                          <span key={opt} className="inline-flex items-center gap-1">
                            <span className="inline-block h-3 w-3 border border-black" /> {opt}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="inline-block w-full border-b border-black/40">&nbsp;</span>
                    )}
                  </td>
                  <td className="p-2 align-top">
                    <span className="inline-block w-full border-b border-black/40">&nbsp;</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-3 border-t border-black p-6 pt-16 text-center">
          <div><div className="mb-1 border-t border-black pt-1">Prepared By (Store)</div></div>
          <div><div className="mb-1 border-t border-black pt-1">Inspected By (QA/QC)</div></div>
          <div><div className="mb-1 border-t border-black pt-1">Approved By</div></div>
        </div>
      </div>
    </div>
  );
}
