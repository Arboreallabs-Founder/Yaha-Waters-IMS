import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-4",
  default: "size-5",
  lg: "size-8",
} as const;

/**
 * Indeterminate loading indicator. Used inline in buttons (via the Button
 * `loading` prop), in Suspense fallbacks, and anywhere a skeleton would be
 * the wrong shape (e.g. a document that is being prepared).
 */
export function Spinner({
  size = "default",
  className,
  label = "Loading",
}: {
  size?: keyof typeof SIZES;
  className?: string;
  label?: string;
}) {
  return (
    <>
      <Loader2 className={cn("animate-spin", SIZES[size], className)} aria-hidden="true" />
      <span className="sr-only" role="status">
        {label}
      </span>
    </>
  );
}
