import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { QrCode } from "@/components/qr-code";
import { PrintButton } from "@/components/print-button";

// Sticker shows ONLY component name + number + QR — never a quantity (locked spec).
export default async function StickersPage({ searchParams }: { searchParams: Promise<{ lots?: string }> }) {
  const { lots } = await searchParams;
  const ids = (lots ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const supabase = await createClient();

  const { data: lotRows } = ids.length
    ? await supabase.from("inventory_lots").select("id, lot_code, component_id").in("id", ids)
    : { data: [] };
  const compIds = [...new Set((lotRows ?? []).map((l) => l.component_id).filter(Boolean))];
  const { data: components } = compIds.length
    ? await supabase.from("components").select("id, component_no, name").in("id", compIds)
    : { data: [] };
  const comp = new Map((components ?? []).map((c) => [c.id, c]));

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 print:hidden">
        <Link href="/inventory/lots" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Inventory
        </Link>
        <span className="ml-auto text-sm text-muted-foreground">{lotRows?.length ?? 0} sticker(s)</span>
        <PrintButton label="Print stickers" />
      </div>

      {(lotRows ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No lots selected.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
          {(lotRows ?? []).map((l) => {
            const c = l.component_id ? comp.get(l.component_id) : null;
            return (
              <div key={l.id} className="flex flex-col items-center gap-2 rounded-lg border border-black/70 bg-white p-3 text-center">
                <p className="text-xs font-bold leading-tight">{c?.name ?? "—"}</p>
                <p className="text-[11px] font-medium text-muted-foreground">{c?.component_no ?? ""}</p>
                <QrCode value={l.lot_code} size={120} />
                <p className="font-mono text-[10px] tracking-tight text-muted-foreground">{l.lot_code}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
