import { PageHeader } from "@/components/page-header";
import { TraceabilityScanner } from "./traceability-scanner";
import { lookupTraceability } from "./actions";

export default function TraceabilityPage() {
  return (
    <div>
      <PageHeader
        title="Traceability"
        description="Scan a component's QR to see its full history — PO, supplier, job work, inspection (IRN), and consumption."
      />
      <TraceabilityScanner lookupAction={lookupTraceability} />
    </div>
  );
}
