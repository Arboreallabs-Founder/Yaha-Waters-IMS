import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import { formatNumber } from "@/lib/utils";

// ---- our company's fixed details (from the real YAHA PO template) ----
const OUR = {
  billingName: "M/S YAHA WATER SYSTEMS PRIVATE LTD.",
  billingAddress: ["305, SAI COMMERCIAL BUILDING,", "GOVANDI,", "MUMBAI 400 088", "MAHARASHTRA"],
  contactName: "MR. RAKESH M.",
  contactMob: "+91 8806565099",
  contactEmail: "rakeshm@yahawater.in",
  gstin: "27AABCY1893P1ZJ",
  pan: "AABCY1893P",
  headOffice: "Head Office : B-305, Sai Commercial Complex, Govandi, Mumbai - 400 088.",
  deliveryAddress: [
    "Yaha Water Systesm Pvt. Ltd.",
    "Plot No. 19, Universal Indl. Estate,",
    "Vil. Dheku, Sajgaon, Khopoli,",
    "Tal. Khalapur, Dist. Raigad - 410203",
  ],
};

const TERMS = [
  "The material is accepted subject to inspection. Please mention our PO no. on your delivery challan & Invoice.",
  "The material should be labelled with it's grade, Batch/Lot No., MFG/Expiry date.",
  "The MTC (Material Test Certificate) should be sent along with the supply.",
  "The failure due to poor work man ship or any other defect shall be replace free of cost with in the warranty period.",
  "PO price are firm and final till the exection of contract, no escalation or reqest in increase the price will be entertain.",
  "The seller shall be liable to pay to buyer LD, a sum equivalent to 0.5% of the Ex work contract value for each week of delay or any part thereof. However, total amount of LD for delay in completion of contract shall be subject to a maximum of 5% fo Ex work contract price.",
];

function formatDateDDMMYYYY(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-GB").replace(/\//g, ".");
}

export default async function PoPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const supabase = await createClient();

  const { data: po } = await supabase.from("purchase_orders").select("*").eq("id", id).single();
  if (!po) notFound();

  const [{ data: lines }, { data: vendor }] = await Promise.all([
    supabase.from("po_lines").select("component_id, project_id, qty_ordered, rate, amount").eq("po_id", id).order("created_at"),
    po.vendor_id ? supabase.from("vendors").select("name, address, contact, gst_no").eq("id", po.vendor_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const componentIds = [...new Set((lines ?? []).map((l) => l.component_id).filter(Boolean))] as string[];
  const projectIds = [...new Set((lines ?? []).map((l) => l.project_id).filter(Boolean))] as string[];
  const [{ data: components }, { data: projects }] = await Promise.all([
    componentIds.length ? supabase.from("components").select("id, component_no, name, uom").in("id", componentIds) : Promise.resolve({ data: [] }),
    projectIds.length ? supabase.from("projects").select("id, project_no").in("id", projectIds) : Promise.resolve({ data: [] }),
  ]);
  const compById = new Map((components ?? []).map((c) => [c.id, c]));
  const projectLabel = projectIds.length
    ? (projects ?? []).map((p) => p.project_no).join(", ")
    : "Stock";

  const lineRows = (lines ?? []).map((l, i) => {
    const c = l.component_id ? compById.get(l.component_id) : null;
    return {
      sr: i + 1,
      item: c ? `${c.component_no} — ${c.name}` : "—",
      uom: c?.uom ?? "",
      qty: Number(l.qty_ordered ?? 0),
      rate: Number(l.rate ?? 0),
      amount: Number(l.amount ?? (l.rate ?? 0) * Number(l.qty_ordered ?? 0)),
    };
  });
  const subtotal = lineRows.reduce((s, l) => s + l.amount, 0);
  const gstPct = Number(po.gst_percent ?? 18);
  const gstAmount = (subtotal * gstPct) / 100;
  const total = subtotal + gstAmount;

  return (
    <div className="mx-auto max-w-4xl bg-white p-6 text-black print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/purchase-orders/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to PO
        </Link>
        <PrintButton label="Print PO" />
      </div>

      <div className="border border-black text-[11px] leading-tight">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black p-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/yaha-logo.png" alt="YAHA" className="h-16 w-16 object-contain" />
            <div>
              <p className="text-2xl font-extrabold tracking-tight">
                YAHA <span className="font-normal">water systems pvt. ltd.</span>
              </p>
              <p className="text-[10px]">{OUR.headOffice}</p>
            </div>
          </div>
          <div className="text-right text-[10px] leading-snug">
            <p className="font-semibold">Sustainable Engineering Solutions for</p>
            <p>Water Treatment</p>
            <p>Cooling Water Systems</p>
            <p>River &amp; Sea Water Intake</p>
            <p>Process Water Treatment</p>
          </div>
        </div>

        <h1 className="border-b border-black py-2 text-center text-lg font-bold">PURCHASE ORDER</h1>

        {/* Date / PO No / Project */}
        <div className="flex justify-between border-b border-black p-3">
          <p>PO DATE : {formatDateDDMMYYYY(po.po_date)}</p>
          <div className="text-right">
            <p>PO NO : {po.po_no}</p>
            <p>Project : {projectLabel}</p>
          </div>
        </div>

        {/* Vendor / Billing */}
        <div className="grid grid-cols-2 gap-3 border-b border-black p-3">
          <div>
            <p className="mb-1 font-bold">VENDOR NAME &amp; ADDRESS :</p>
            <p className="font-medium">{vendor?.name ?? "—"}</p>
            {vendor?.address
              ? vendor.address.split("\n").map((l: string, i: number) => <p key={i}>{l}</p>)
              : <p className="italic text-muted-foreground">(no address on file — Masters → Vendors)</p>}
            {vendor?.contact && <p className="mt-2">{vendor.contact}</p>}
          </div>
          <div>
            <p className="mb-1 font-bold">BILLING NAME &amp; ADDRESS :</p>
            <p className="font-medium">{OUR.billingName}</p>
            {OUR.billingAddress.map((l) => <p key={l}>{l}</p>)}
            <p className="mt-2">{OUR.contactName}</p>
            <p>MOB.:{OUR.contactMob}</p>
            <p>Email: {OUR.contactEmail}</p>
          </div>
        </div>

        <p className="border-b border-black p-3">
          We are pleased to place an order for the supply of following items on the terms and conditions mentioned below :-
        </p>

        {/* Line items */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black">
              <th className="border-r border-black p-1.5 text-left">Sr. No.</th>
              <th className="border-r border-black p-1.5 text-left">ITEM</th>
              <th className="border-r border-black p-1.5 text-right">Qty.</th>
              <th className="border-r border-black p-1.5 text-left">UOM</th>
              <th className="border-r border-black p-1.5 text-right">Rate</th>
              <th className="p-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lineRows.length === 0 ? (
              <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">No lines.</td></tr>
            ) : (
              lineRows.map((l) => (
                <tr key={l.sr} className="border-b border-black/20">
                  <td className="border-r border-black/20 p-1.5">{l.sr}</td>
                  <td className="border-r border-black/20 p-1.5">{l.item}</td>
                  <td className="border-r border-black/20 p-1.5 text-right">{formatNumber(l.qty)}</td>
                  <td className="border-r border-black/20 p-1.5">{l.uom}</td>
                  <td className="border-r border-black/20 p-1.5 text-right">{l.rate ? formatNumber(l.rate) : "—"}</td>
                  <td className="p-1.5 text-right">{formatNumber(l.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Totals */}
        <div className="grid grid-cols-2 border-t border-black">
          <div className="border-r border-black p-3">
            <p>GSTIN : {OUR.gstin}</p>
            <p>PAN : {OUR.pan}</p>
            <p>Taxes as applicable - At Actual</p>
          </div>
          <div className="p-3">
            <div className="flex justify-between"><span>SUBTOTAL</span><span>Rs {formatNumber(subtotal)}</span></div>
            <div className="flex justify-between"><span>GST {formatNumber(gstPct)}%</span><span>{formatNumber(gstAmount)}</span></div>
            <div className="flex justify-between border-t border-black font-bold"><span>TOTAL</span><span>Rs {formatNumber(total)}</span></div>
          </div>
        </div>

        {/* Terms & Condition */}
        <div className="border-t border-black p-3">
          <p className="mb-1 font-bold">TERMS &amp; CONDITION:</p>
          <ol className="list-decimal space-y-0.5 pl-4">
            {TERMS.map((t) => <li key={t}>{t}</li>)}
          </ol>
        </div>

        {/* Delivery address + terms */}
        <div className="grid grid-cols-2 gap-3 border-t border-black p-3">
          <div>
            <p className="mb-1 font-bold">Delivery Address :</p>
            {OUR.deliveryAddress.map((l) => <p key={l}>{l}</p>)}
          </div>
          <div>
            <p className="mb-1 font-bold">Terms &amp; Condition:</p>
            <p>Delivery : {po.delivery_terms}</p>
            <p>Payment : {po.payment_terms}</p>
            <p>Freight : {po.freight_terms}</p>
          </div>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-3 border-t border-black p-6 pt-16 text-center">
          <div>
            <div className="mb-1 border-t border-black pt-1">PREPARED BY{profile?.full_name ? ` — ${profile.full_name}` : ""}</div>
          </div>
          <div>
            <div className="mb-1 border-t border-black pt-1">VERIFIED BY</div>
          </div>
          <div>
            <div className="mb-1 border-t border-black pt-1">APPROVED BY</div>
          </div>
        </div>
      </div>
    </div>
  );
}
