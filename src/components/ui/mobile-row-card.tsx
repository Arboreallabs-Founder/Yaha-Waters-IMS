import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shared mobile card shell for a table row — used as the `sm:hidden` companion
 * to a `hidden sm:block` <Table>, so wide tables read as a stacked card list on
 * phones instead of horizontal-scrolling. Field mapping stays page-specific;
 * this just keeps every converted table visually consistent.
 */
export function MobileRowCard({
  title,
  subtitle,
  badge,
  fields,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  fields: { label: string; value: React.ReactNode }[];
  actions?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{title}</p>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
        {fields.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            {fields.map((f, i) => (
              <React.Fragment key={i}>
                <dt className="self-center text-xs text-muted-foreground">{f.label}</dt>
                <dd className="text-right font-medium">{f.value}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
        {actions && <div className="flex justify-end gap-1 pt-1">{actions}</div>}
      </CardContent>
    </Card>
  );
}
