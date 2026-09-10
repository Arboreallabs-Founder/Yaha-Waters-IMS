import { HeaderSkeleton, StatsSkeleton, PanelsSkeleton } from "@/components/ui/page-skeletons";

/**
 * Fallback for the dashboard and any segment without its own `loading.tsx`.
 * Shaped like the dashboard (stat strip + panels) since every other route now
 * defines a skeleton that matches its own layout.
 */
export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <StatsSkeleton count={5} />
      <div className="mt-8">
        <PanelsSkeleton count={2} />
      </div>
    </div>
  );
}
