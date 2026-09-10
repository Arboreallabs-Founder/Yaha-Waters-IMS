import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

/** Title + description + primary-action placeholder, matching `PageHeader`. */
export function HeaderSkeleton() {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-9 w-28" />
    </div>
  );
}

/** Rows of a data table. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** A row of summary stat cards. */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

/** Stacked content cards, for detail pages built out of panels. */
export function PanelsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-48 w-full" />
      ))}
    </div>
  );
}

/** List page: header + table. */
export function ListPageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div>
      <HeaderSkeleton />
      <TableSkeleton rows={rows} />
    </div>
  );
}

/** Detail page: header + summary strip + panels. */
export function DetailPageSkeleton({ panels = 3 }: { panels?: number }) {
  return (
    <div>
      <HeaderSkeleton />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <PanelsSkeleton count={panels} />
    </div>
  );
}

/**
 * Print/document routes. A skeleton would imply the layout is nearly ready;
 * these pages assemble a whole document server-side, so say so instead.
 */
export function DocumentSkeleton({ label = "Preparing document…" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Spinner size="lg" label={label} />
      <p className="text-sm">{label}</p>
    </div>
  );
}
