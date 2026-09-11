import Link from "next/link";
import { notFound } from "next/navigation";
import { ScanLine } from "lucide-react";
import { getProfile, canSeeFinancials } from "@/lib/auth";
import { getLotTraceability } from "@/lib/server/traceability";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { TraceabilityResult } from "../traceability-result";

/**
 * One lot's traceability, addressed by lot code so the page can be linked to —
 * from the QR on the lot detail page, or pasted to a colleague.
 *
 * The code is a path segment rather than a query param on purpose: the auth
 * middleware builds its post-login `next` from the pathname only, so `?code=`
 * would be silently dropped when a signed-out person opens the link.
 */
export default async function LotTraceabilityPage({
  params,
}: {
  params: Promise<{ lotCode: string }>;
}) {
  // Next has already decoded the segment — decoding again would corrupt any
  // code containing a literal '%'.
  const { lotCode } = await params;

  const [profile, data] = await Promise.all([getProfile(), getLotTraceability(lotCode)]);
  if (!data) notFound();

  const title = data.lot.component_no
    ? `${data.lot.component_no} — ${data.lot.component_name}`
    : data.lot.lot_code;

  return (
    <div>
      <PageHeader
        title={title}
        description={`Traceability for lot ${data.lot.lot_code}`}
        action={
          <Link href="/traceability" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ScanLine className="size-4" /> Scan another
          </Link>
        }
      />
      <TraceabilityResult data={data} finance={canSeeFinancials(profile?.role)} />
    </div>
  );
}
