import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/print-button";
import { formatNumber } from "@/lib/utils";

// ---- MRIN form's own fixed header block (distinct from the PO print's OUR block) ----
const MRIN_OUR = {
  tagline: "Providing Design, Engineering & Manufacturing of Self Cleaning Auto Backwash Filters & Complete Water & Waste Water Treatment Plant.",
  address: "Survey No. 26, Unit No.19, Universal Ind. Estate, Dheku, Sajgaon, Khopoli, Khalapur, District- Raigad : 410203.",
  formatNo: "YWSPL/MRIN/001",
  rev: "Rev.00",
  formDate: "28.07.2026",
};

function formatDateDDMMYYYY(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-GB").replace(/\//g, ".");
}

function itemDescription(c: { component_no: string; name: string } | undefined): string {
  if (!c) return "—";
  return `${c.component_no} — ${c.name}`;
}

function specGrade(c: { spec: string | null; grade: string | null } | undefined): string {
  if (!c) return "—";
  return [c.spec, c.grade].filter(Boolean).join(" / ") || "—";
}

function sizeLabel(
  c: { nominal_size: string | null; od_mm: number | null; id_mm: number | null; thk_mm: number | null; width_mm: number | null; length_mm: number | null } | undefined,
): string {
  if (!c) return "—";
  if (c.nominal_size) return c.nominal_size;
  const parts: string[] = [];
  if (c.od_mm) parts.push(`OD ${c.od_mm}`);
  if (c.id_mm) parts.push(`ID ${c.id_mm}`);
  if (c.thk_mm) parts.push(`THK ${c.thk_mm}`);
  if (c.width_mm) parts.push(`W ${c.width_mm}`);
  if (c.length_mm) parts.push(`L ${c.length_mm}`);
  return parts.length ? parts.join(" x ") : "—";
}

export default async function GrnPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: grnId } = await params;
  const supabase = await createClient();

  const { data: grn } = await supabase.from("grns").select("*").eq("id", grnId).single();
  if (!grn) notFound();

  const [{ data: vendor }, { data: grnLines }, { data: checklistFields }] = await Promise.all([
    grn.vendor_id ? supabase.from("vendors").select("name").eq("id", grn.vendor_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("grn_lines").select("id, component_id, po_line_id, qty_received").eq("grn_id", grnId).order("created_at"),
    supabase
      .from("inspection_templates")
      .select("id, inspection_template_fields(id, label, field_type, sort_order, is_active)")
      .eq("name", "MRIN Inspection Checklist")
      .maybeSingle(),
  ]);

  const fields = (
    (checklistFields?.inspection_template_fields as { id: string; label: string; field_type: string; sort_order: number; is_active: boolean }[] | null) ?? []
  )
    .filter((f) => f.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  const componentIds = [...new Set((grnLines ?? []).map((l) => l.component_id).filter(Boolean))] as string[];
  const poLineIds = [...new Set((grnLines ?? []).map((l) => l.po_line_id).filter(Boolean))] as string[];
  const grnLineIds = (grnLines ?? []).map((l) => l.id);
  const [{ data: components }, { data: poLines }, { data: irns }] = await Promise.all([
    componentIds.length
      ? supabase.from("components").select("id, component_no, name, uom, spec, grade, nominal_size, od_mm, id_mm, thk_mm, width_mm, length_mm").in("id", componentIds)
      : Promise.resolve({ data: [] }),
    poLineIds.length ? supabase.from("po_lines").select("id, po_id, qty_ordered, purchase_orders(po_no)") .in("id", poLineIds) : Promise.resolve({ data: [] }),
    grnLineIds.length ? supabase.from("irns").select("id, grn_line_id").in("grn_line_id", grnLineIds) : Promise.resolve({ data: [] }),
  ]);
  const compById = new Map((components ?? []).map((c) => [c.id, c]));
  const poLineById = new Map((poLines ?? []).map((p) => [p.id, p]));
  const irnByGrnLine = new Map((irns ?? []).map((i) => [i.grn_line_id, i]));
  const poNos = [...new Set((poLines ?? []).map((p) => (p.purchase_orders as unknown as { po_no: string } | null)?.po_no).filter(Boolean))] as string[];

  const irnIds = (irns ?? []).map((i) => i.id);
  const { data: answers } = irnIds.length
    ? await supabase.from("irn_answers").select("irn_id, field_id, text_value, choice_value").in("irn_id", irnIds)
    : { data: [] };
  const answersByIrn = new Map<string, Map<string, { text_value: string | null; choice_value: string | null }>>();
  for (const a of answers ?? []) {
    if (!answersByIrn.has(a.irn_id)) answersByIrn.set(a.irn_id, new Map());
    answersByIrn.get(a.irn_id)!.set(a.field_id, { text_value: a.text_value, choice_value: a.choice_value });
  }

  const lineRows = (grnLines ?? []).map((gl, i) => {
    const c = gl.component_id ? compById.get(gl.component_id) : undefined;
    const pl = gl.po_line_id ? poLineById.get(gl.po_line_id) : undefined;
    const irn = irnByGrnLine.get(gl.id);
    const irnAnswers = irn ? answersByIrn.get(irn.id) : undefined;
    return {
      sr: i + 1,
      item: itemDescription(c),
      specGrade: specGrade(c),
      size: sizeLabel(c),
      unit: c?.uom ?? "—",
      poQty: pl?.qty_ordered ?? null,
      receivedQty: gl.qty_received,
      checklist: fields.map((f) => {
        const a = irnAnswers?.get(f.id);
        if (!a) return "—";
        if (f.field_type === "checkbox") return a.choice_value === "true" ? "✓" : a.choice_value === "false" ? "✗" : "—";
        return a.text_value || a.choice_value || "—";
      }),
    };
  });

  return (
    <div className="mx-auto max-w-6xl bg-white p-6 text-black print:p-0">
      <style>{"@page { size: A4 landscape; margin: 10mm; }"}</style>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/grn/${grnId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to GRN
        </Link>
        <PrintButton label="Print MRIN" />
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
              <p className="mt-0.5 max-w-md text-[9px]">{MRIN_OUR.tagline}</p>
              <p className="text-[9px]">{MRIN_OUR.address}</p>
            </div>
          </div>
          <div className="whitespace-nowrap text-right text-[9px] leading-snug">
            <p>Format No.: {MRIN_OUR.formatNo}</p>
            <p>{MRIN_OUR.rev}</p>
            <p>Date : {MRIN_OUR.formDate}</p>
          </div>
        </div>

        <h1 className="border-b border-black py-2 text-center text-base font-bold">MATERIAL RECEIPT CUM INSPECTION NOTE (MRIN)</h1>

        {/* GRN info */}
        <div className="grid grid-cols-4 divide-x divide-black border-b border-black">
          <div className="p-2"><span className="font-semibold">GRN No.:</span> {grn.grn_no}</div>
          <div className="p-2"><span className="font-semibold">Vendor:</span> {vendor?.name ?? "—"}</div>
          <div className="p-2"><span className="font-semibold">Date:</span> {formatDateDDMMYYYY(grn.received_at)}</div>
          <div className="p-2"><span className="font-semibold">PO No.:</span> {poNos.length ? poNos.join(", ") : "—"}</div>
          <div className="p-2"><span className="font-semibold">Challan No.:</span> {grn.challan_no ?? "—"}</div>
          <div className="p-2"><span className="font-semibold">Invoice No.:</span> {grn.invoice_no ?? "—"}</div>
        </div>

        {/* Line items with inspection checklist folded in */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black">
              <th className="border-r border-black p-1 text-left">Sr.</th>
              <th className="border-r border-black p-1 text-left">Item Description</th>
              <th className="border-r border-black p-1 text-left">Spec &amp; Grade</th>
              <th className="border-r border-black p-1 text-left">Size</th>
              <th className="border-r border-black p-1 text-left">Unit</th>
              <th className="border-r border-black p-1 text-right">PO Qty</th>
              <th className="border-r border-black p-1 text-right">Received</th>
              {fields.map((f) => (
                <th key={f.id} className="border-r border-black p-1 text-center">{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineRows.length === 0 ? (
              <tr><td colSpan={7 + fields.length} className="p-3 text-center text-muted-foreground">No lines.</td></tr>
            ) : (
              lineRows.map((l) => (
                <tr key={l.sr} className="border-b border-black/20">
                  <td className="border-r border-black/20 p-1">{l.sr}</td>
                  <td className="border-r border-black/20 p-1">{l.item}</td>
                  <td className="border-r border-black/20 p-1">{l.specGrade}</td>
                  <td className="border-r border-black/20 p-1">{l.size}</td>
                  <td className="border-r border-black/20 p-1">{l.unit}</td>
                  <td className="border-r border-black/20 p-1 text-right">{l.poQty !== null ? formatNumber(l.poQty) : "—"}</td>
                  <td className="border-r border-black/20 p-1 text-right">{formatNumber(l.receivedQty)}</td>
                  {l.checklist.map((v, idx) => (
                    <td key={idx} className="border-r border-black/20 p-1 text-center">{v}</td>
                  ))}
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
