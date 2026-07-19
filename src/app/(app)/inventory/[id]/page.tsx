import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canSeeFinancials } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRowCard } from "@/components/ui/mobile-row-card";
import { formatNumber, formatINR, formatDate } from "@/lib/utils";
import { UnissueLotButton } from "./unissue-button";

type Lot = {
  id: string; lot_code: string; qty_on_hand: string | number; qty_initial: string | number;
  location: string | null; status: string; unit_cost: number | null;
  created_at: string; project_id: string | null; vendor_id: string | null;
  piece_count: string | number | null; piece_length: string | number | null; piece_width: string | number | null;
};

/** Renders qty with dimension breakdown for length/area lots. */
function QtyCell({ lot, qt }: { lot: Lot; qt: string }) {
  const qty = Number(lot.qty_on_hand);
  const pc = Number(lot.piece_count) || null;
  const pl = Number(lot.piece_length) || null;
  const pw = Number(lot.piece_width) || null;

  if (qt === "length" && pc && pl) {
    return (
      <span>
        <span className="font-semibold">{formatNumber(qty)} m</span>
        <span className="ml-1.5 text-xs text-muted-foreground">({pc} × {pl} m)</span>
      </span>
    );
  }
  if (qt === "area" && pc && pl && pw) {
    return (
      <span>
        <span className="font-semibold">{formatNumber(qty)} m²</span>
        <span className="ml-1.5 text-xs text-muted-foreground">({pc} × {pw}×{pl} m)</span>
      </span>
    );
  }
  return <span className="font-semibold">{formatNumber(qty)}</span>;
}

function qtUnit(qt: string) {
  if (qt === "length") return "m";
  if (qt === "area") return "m²";
  return "";
}

export default async function ComponentInventoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const finance = canSeeFinancials(profile?.role);
  const isAdmin = profile?.role === "admin" || profile?.role === "team_lead";
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from("components")
    .select("id, component_no, name, uom, quantity_type")
    .eq("id", id)
    .single();
  if (!comp) notFound();
  const qt = (comp as { quantity_type?: string }).quantity_type ?? "nos";

  const [{ data: allLots }, { data: movements }] = await Promise.all([
    supabase
      .from("inventory_lots")
      .select("id, lot_code, qty_on_hand, qty_initial, location, status, unit_cost, created_at, project_id, vendor_id, piece_count, piece_length, piece_width")
      .eq("component_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("stock_movements")
      .select("id, lot_id, movement_type, qty, project_id, reference_type, performed_by, performed_at")
      .eq("component_id", id)
      .eq("movement_type", "issue")
      .order("performed_at", { ascending: false })
      .limit(200),
  ]);

  const lots = (allLots ?? []) as Lot[];
  const openLots   = lots.filter((l) => l.status === "open");
  const issuedLots = lots.filter((l) => l.status === "issued");

  const openQty   = openLots.reduce((s, l) => s + Number(l.qty_on_hand), 0);
  const issuedQty = issuedLots.reduce((s, l) => s + Number(l.qty_on_hand), 0);
  const consumedQty = lots
    .filter((l) => l.status === "consumed")
    .reduce((s, l) => s + (Number(l.qty_initial) - Number(l.qty_on_hand)), 0);

  const allProjectIds = [...new Set([
    ...lots.map((l) => l.project_id),
    ...(movements ?? []).map((m) => m.project_id),
  ].filter(Boolean))];
  const { data: projects } = allProjectIds.length
    ? await supabase.from("projects").select("id, project_no").in("id", allProjectIds)
    : { data: [] };
  const projNo = new Map((projects ?? []).map((p) => [p.id, p.project_no]));

  const performerIds = [...new Set((movements ?? []).map((m) => m.performed_by).filter(Boolean))];
  const { data: perfProfiles } = performerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", performerIds)
    : { data: [] };
  const perfName = new Map((perfProfiles ?? []).map((p) => [p.id, p.full_name]));
  const lotCode  = new Map(lots.map((l) => [l.id, l.lot_code]));

  const unit = qtUnit(qt);
  const unitSuffix = unit ? ` ${unit}` : "";

  return (
    <div>
      <Link href="/inventory" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All inventory
      </Link>

      <PageHeader
        title={`${comp.component_no} — ${comp.name}`}
        description={[
          comp.uom ? `Unit: ${comp.uom}` : null,
          qt !== "nos" ? (qt === "length" ? "Lot type: Length (metres)" : "Lot type: Area (sq metres)") : null,
        ].filter(Boolean).join(" · ") || undefined}
      />

      {/* Summary */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Open</p>
            <p className="mt-1 text-2xl font-bold text-green-700">{formatNumber(openQty)}{unitSuffix}</p>
            <p className="text-xs text-muted-foreground">{openLots.length} lot{openLots.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Issued (frozen)</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{formatNumber(issuedQty)}{unitSuffix}</p>
            <p className="text-xs text-muted-foreground">{issuedLots.length} lot{issuedLots.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Consumed (all time)</p>
            <p className="mt-1 text-2xl font-bold text-muted-foreground">{formatNumber(consumedQty)}{unitSuffix}</p>
            <p className="text-xs text-muted-foreground">{(movements ?? []).length} movements</p>
          </CardContent>
        </Card>
      </div>

      {/* Open lots */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Open inventory</h2>
        {openLots.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">No open lots.</p>
        ) : (
          <>
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lot code</TableHead>
                    <TableHead>On hand</TableHead>
                    <TableHead>Location</TableHead>
                    {finance && <TableHead>Unit cost{unit ? ` (₹/${unit})` : ""}</TableHead>}
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openLots.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs">{l.lot_code}</TableCell>
                      <TableCell><QtyCell lot={l} qt={qt} /></TableCell>
                      <TableCell className="text-muted-foreground">{l.location ?? "—"}</TableCell>
                      {finance && <TableCell className="text-muted-foreground">{formatINR(l.unit_cost)}</TableCell>}
                      <TableCell className="text-right">
                        <Link href={`/inventory/lots/${l.id}`} aria-label="Lot detail" className={buttonVariants({ variant: "ghost", size: "icon" })}>
                          <ArrowRight className="size-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 sm:hidden">
              {openLots.map((l) => (
                <Link key={l.id} href={`/inventory/lots/${l.id}`} className="block">
                  <MobileRowCard
                    title={l.lot_code}
                    fields={[
                      { label: "On hand", value: <QtyCell lot={l} qt={qt} /> },
                      { label: "Location", value: l.location ?? "—" },
                      ...(finance ? [{ label: `Unit cost${unit ? ` (₹/${unit})` : ""}`, value: formatINR(l.unit_cost) }] : []),
                    ]}
                  />
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Issued lots */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Issued inventory <span className="ml-1 font-normal normal-case text-amber-600">(frozen under a project)</span>
        </h2>
        {issuedLots.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">No issued lots.</p>
        ) : (
          <>
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lot code</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Location</TableHead>
                    {finance && <TableHead>Unit cost{unit ? ` (₹/${unit})` : ""}</TableHead>}
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issuedLots.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs">{l.lot_code}</TableCell>
                      <TableCell className="text-amber-700"><QtyCell lot={l} qt={qt} /></TableCell>
                      <TableCell>
                        {l.project_id
                          ? <Badge variant="secondary">{projNo.get(l.project_id) ?? "—"}</Badge>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{l.location ?? "—"}</TableCell>
                      {finance && <TableCell className="text-muted-foreground">{formatINR(l.unit_cost)}</TableCell>}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isAdmin && <UnissueLotButton lotId={l.id} componentId={id} />}
                          <Link href={`/inventory/lots/${l.id}`} aria-label="Lot detail" className={buttonVariants({ variant: "ghost", size: "icon" })}>
                            <ArrowRight className="size-4" />
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 sm:hidden">
              {issuedLots.map((l) => (
                <MobileRowCard
                  key={l.id}
                  title={l.lot_code}
                  badge={l.project_id ? <Badge variant="secondary">{projNo.get(l.project_id) ?? "—"}</Badge> : undefined}
                  fields={[
                    { label: "Qty", value: <span className="text-amber-700"><QtyCell lot={l} qt={qt} /></span> },
                    { label: "Location", value: l.location ?? "—" },
                    ...(finance ? [{ label: `Unit cost${unit ? ` (₹/${unit})` : ""}`, value: formatINR(l.unit_cost) }] : []),
                  ]}
                  actions={
                    <>
                      {isAdmin && <UnissueLotButton lotId={l.id} componentId={id} />}
                      <Link href={`/inventory/lots/${l.id}`} aria-label="Lot detail" className={buttonVariants({ variant: "ghost", size: "icon" })}>
                        <ArrowRight className="size-4" />
                      </Link>
                    </>
                  }
                />
              ))}
            </div>
          </>
        )}
        {isAdmin && issuedLots.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Unissuing a lot removes its project reservation and returns it to open stock.
          </p>
        )}
      </section>

      {/* Consumption history */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Consumption history</h2>
        {(movements ?? []).length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">No consumption recorded yet.</p>
        ) : (
          <>
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Qty consumed</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Via</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(movements ?? []).map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-muted-foreground">{formatDate(m.performed_at)}</TableCell>
                      <TableCell className="font-mono text-xs">{lotCode.get(m.lot_id) ?? "—"}</TableCell>
                      <TableCell className="font-semibold text-red-600">
                        {formatNumber(Math.abs(Number(m.qty)))}{unitSuffix}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {m.project_id ? projNo.get(m.project_id) ?? "—" : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {m.performed_by ? (perfName.get(m.performed_by) ?? "—") : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{m.reference_type ?? "—"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 sm:hidden">
              {(movements ?? []).map((m) => (
                <MobileRowCard
                  key={m.id}
                  title={lotCode.get(m.lot_id) ?? "—"}
                  subtitle={formatDate(m.performed_at)}
                  badge={<Badge variant="secondary">{m.reference_type ?? "—"}</Badge>}
                  fields={[
                    { label: "Qty consumed", value: <span className="font-semibold text-red-600">{formatNumber(Math.abs(Number(m.qty)))}{unitSuffix}</span> },
                    { label: "Project", value: m.project_id ? projNo.get(m.project_id) ?? "—" : "—" },
                    { label: "By", value: m.performed_by ? (perfName.get(m.performed_by) ?? "—") : "—" },
                  ]}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
