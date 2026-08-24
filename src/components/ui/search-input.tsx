import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Icon + text input wrapper for a client-side list search box (visual only — caller owns the filter state/logic). */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative flex-1 min-w-[200px]", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
      <Input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className="pl-8" />
    </div>
  );
}
