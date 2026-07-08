import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/utils";
import { NewGrnButton } from "./new-grn-button";

export default async function GrnPage() {
  const supabase = await createClient();
  const [{ data: grns }, { data: vendors }, { data: pos }, { data: lines }] = await Promise.all([
    supabase.from("grns").select("*").order("received_at", { ascending: false }),
    supabase.from("vendors").select("id, name").eq("is_active", true).order("name"),
    supabase.from("purchase_orders").select("id, po_no, status").neq("status", "completed").neq("status", "cancelled").order("created_at", { ascending: false }),
    supabase.from("grn_lines").select("grn_id"),
  ]);

  const vName = new Map((vendors ?? []).map((v) => [v.id, v.name]));
  const poNo = new Map((pos ?? []).map((p) => [p.id, p.po_no]));
  const lineCount = new Map<string, number>();
  for (const l of lines ?? []) lineCount.set(l.grn_id, (lineCount.get(l.grn_id) ?? 0) + 1);

  return (
    <div>
      <PageHeader
        title="Goods Receipt"
        description="Receive material at the gate — matched to a PO, or captured untagged (no-PO / phone orders)."
        action={<NewGrnButton openPos={(pos ?? []).map((p) => ({ id: p.id, label: p.po_no }))} vendors={vendors ?? []} />}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>GRN No.</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Challan</TableHead>
            <TableHead>Against PO</TableHead>
            <TableHead>Lines</TableHead>
            <TableHead>Received</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(grns ?? []).length === 0 ? (
            <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No goods receipts yet.</TableCell></TableRow>
          ) : (
            (grns ?? []).map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-medium">{g.grn_no}</TableCell>
                <TableCell>{g.vendor_id ? vName.get(g.vendor_id) ?? "—" : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-muted-foreground">{g.challan_no ?? "—"}</TableCell>
                <TableCell>{g.po_id ? poNo.get(g.po_id) ?? "—" : <span className="text-muted-foreground">untagged</span>}</TableCell>
                <TableCell>{formatNumber(lineCount.get(g.id) ?? 0)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(g.received_at)}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/grn/${g.id}`} aria-label="Open" className={buttonVariants({ variant: "ghost", size: "icon" })}>
                    <ArrowRight className="size-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
