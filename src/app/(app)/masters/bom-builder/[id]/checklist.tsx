"use client";

import * as React from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Line, PreviewLine } from "../../bom-templates/[id]/template-line-editor";

export function BuilderChecklist({
  hasCategory,
  lines,
  subLinesByTemplate,
  subTemplateByComponent,
}: {
  hasCategory: boolean;
  lines: Line[];
  subLinesByTemplate: Record<string, PreviewLine[]>;
  subTemplateByComponent: Record<string, string>;
}) {
  const issues = React.useMemo(() => {
    const out: string[] = [];
    if (!hasCategory) out.push("Product has no category.");
    if (lines.length === 0) out.push("No BOM lines yet.");

    const childCount = new Map<string, number>();
    for (const l of lines) {
      if (l.parent_line_id) childCount.set(l.parent_line_id, (childCount.get(l.parent_line_id) ?? 0) + 1);
    }

    for (const l of lines) {
      const label = l.component_label || l.assembly_name || l.section || "a line";
      const isFolder = l.line_type === "assembly" && !l.component_id;
      const isPromoted = l.line_type === "assembly" && !!l.component_id;

      if (isFolder) {
        if ((childCount.get(l.id) ?? 0) === 0) out.push(`Sub-assembly “${l.assembly_name || l.section || label}” has no parts.`);
        continue;
      }
      if (isPromoted) {
        const stId = l.component_id ? subTemplateByComponent[l.component_id] : undefined;
        if (!stId || (subLinesByTemplate[stId]?.length ?? 0) === 0) {
          out.push(`Sub-assembly “${label}” has an empty sub-BOM.`);
        }
        continue;
      }
      if (l.is_variant_driven) {
        const map = l.variant_rule?.map ?? {};
        if (Object.keys(map).length === 0) out.push(`Variant line “${label}” has no configuration mapped.`);
      } else if (!(Number(l.quantity) > 0)) {
        out.push(`Line “${label}” has no quantity.`);
      }
    }
    return out;
  }, [hasCategory, lines, subLinesByTemplate, subTemplateByComponent]);

  if (issues.length === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30">
        <CardContent className="flex items-center gap-2 p-4 text-sm text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="size-4" /> This BOM looks complete.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30">
      <CardContent className="p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
          <AlertTriangle className="size-4" /> {issues.length} thing{issues.length > 1 ? "s" : ""} to finish
        </p>
        <ul className="ml-6 list-disc space-y-1 text-sm text-amber-800 dark:text-amber-300/90">
          {issues.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
