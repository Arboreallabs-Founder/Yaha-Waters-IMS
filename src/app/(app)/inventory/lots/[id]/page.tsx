import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canSeeFinancials } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { QrCode } from "@/components/qr-code";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRowCard } from "@/components/ui/mobile-row-card";
import { formatNumber, formatDate, formatINR } from "@/lib/utils";
import { LotActions } from "./lot-actions";

const MOVE_LABEL: Record<string, string> = {
  receipt: "Receipt", issue: "Issue", adjustment: "Adjustment", transfer: "Transfer", return: "Return",
};

export default async function LotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const finance = canSeeFinancials(profile?.role);
  const canManage = profile?.role === "admin" || profile?.role === "team_lead";
  const supabase = await createClient();

  const { data: lot } = await supabase.from("inventory_lots").select("*").eq("id", id).single();
  if (!lot) notFound();

  const [{ data: comp }, { data: vendor }, { data: project }, { data: moves }, { data: projects }, { data: parentLot }] =
    await Promise.all([
      lot.component_id ? supabase.from("components").select("component_no, name").eq("id", lot.component_id).maybeSingle() : Promise.resolve({ data: null }),
      lot.vendor_id ? supabase.from("vendors").select("name").eq("id", lot.vendor_id).maybeSingle() : Promise.resolve({ data: null }),
      lot.project_id ? supabase.from("projects").select("project_no").eq("id", lot.project_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("stock_movements").select("*").eq("lot_id", id).order("performed_at", { ascending: false }),
      supabase.from("projects").select("id, project_no").order("project_no"),
      lot.parent_lot_id ? supabase.from("inventory_lots").select("id, lot_code").eq("id", lot.parent_lot_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
  const isBox = !!lot.container_no;

  const projNo = new Map((projects ?? []).map((p) => [p.id, p.project_no]));

  return (
    <div>
      <Link href={lot.component_id ? `/inventory/${lot.component_id}` : "/inventory"} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {comp ? `${comp.component_no} lots` : "Inventory"}
      </Link>
      <PageHeader
        title={comp ? `${comp.component_no} — ${comp.name}` : "Lot"}
        description={lot.lot_code}
        action={
          <Link href={`/inventory/stickers?lots=${lot.id}`} className={buttonVariants({ variant: "outline" })}>
            Print sticker
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-3">
            <Info label="On hand" value={formatNumber(lot.qty_on_hand)} />
            <Info label="Initial" value={formatNumber(lot.qty_initial)} />
            <Info label="Status" value={lot.status} />
            {lot.jw_stage && <Info label="Job-work stage" value={lot.jw_stage === "raw" ? "Raw (needs job work)" : "Completed"} />}
            {isBox && <Info label="Box" value={lot.container_no} />}
            <Info label="Location" value={lot.location} />
            <Info label="Vendor" value={vendor?.name} />
            <Info label="Project" value={project?.project_no} />
            {finance && <Info label="Unit cost" value={formatINR(lot.unit_cost)} />}
            <Info label="Received" value={formatDate(lot.created_at)} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-5">
            <QrCode value={lot.lot_code} size={140} />
            <p className="font-mono text-[11px] text-muted-foreground">{lot.lot_code}</p>
          </CardContent>
        </Card>
      </div>

      {parentLot && (
        <p className="mb-4 text-sm text-muted-foreground">
          Completed via job work from raw lot{" "}
          <Link href={`/inventory/lots/${parentLot.id}`} className="font-mono text-primary hover:underline">{parentLot.lot_code}</Link>.
        </p>
      )}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Actions</h2>
      <Card className="mb-8"><CardContent className="p-5">
        <LotActions lotId={id} qtyOnHand={Number(lot.qty_on_hand ?? 0)} projects={projects ?? []} canManage={canManage} isBox={isBox} rawStage={lot.jw_stage === "raw"} />
      </CardContent></Card>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ledger (immutable)</h2>
      {(moves ?? []).length === 0 ? (
        <p className="py-6 text-center text-muted-foreground">No movements.</p>
      ) : (
        <>
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Movement</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Ref</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(moves ?? []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-muted-foreground">{formatDate(m.performed_at)}</TableCell>
                    <TableCell><Badge variant={m.movement_type === "issue" ? "warning" : "secondary"}>{MOVE_LABEL[m.movement_type] ?? m.movement_type}</Badge></TableCell>
                    <TableCell className={Number(m.qty) < 0 ? "text-red-600" : "text-green-700"}>{Number(m.qty) > 0 ? "+" : ""}{formatNumber(m.qty)}</TableCell>
                    <TableCell className="text-muted-foreground">{m.project_id ? projNo.get(m.project_id) ?? "—" : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{m.reference_type ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-3 sm:hidden">
            {(moves ?? []).map((m) => (
              <MobileRowCard
                key={m.id}
                title={MOVE_LABEL[m.movement_type] ?? m.movement_type}
                subtitle={formatDate(m.performed_at)}
                badge={<Badge variant={m.movement_type === "issue" ? "warning" : "secondary"}>{m.reference_type ?? "—"}</Badge>}
                fields={[
                  { label: "Qty", value: <span className={Number(m.qty) < 0 ? "text-red-600" : "text-green-700"}>{Number(m.qty) > 0 ? "+" : ""}{formatNumber(m.qty)}</span> },
                  { label: "Project", value: m.project_id ? projNo.get(m.project_id) ?? "—" : "—" },
                ]}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value || "—"}</p>
    </div>
  );
}
