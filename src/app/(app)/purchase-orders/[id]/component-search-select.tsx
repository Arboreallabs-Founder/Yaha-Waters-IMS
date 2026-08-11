"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Item = { id: string; component_no: string; name: string; is_job_work?: boolean };

/** Type-to-filter component picker — click (or Enter) a result to select it. */
export function ComponentSearchSelect({
  items,
  value,
  onChange,
  name,
  placeholder = "Search component no. or name…",
}: {
  items: Item[];
  value: string;
  onChange: (id: string) => void;
  name: string;
  placeholder?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Keep the visible text in sync when the selection changes externally
  // (e.g. the form resets after a successful add).
  React.useEffect(() => {
    if (!value) { setQuery(""); return; }
    const item = items.find((i) => i.id === value);
    if (item) setQuery(`${item.component_no} — ${item.name}`);
  }, [value, items]);

  const results = React.useMemo(() => {
    if (!open) return [];
    const q = query.trim().toLowerCase();
    const pool = q
      ? items.filter((i) => i.component_no.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
      : items;
    return pool.slice(0, 50);
  }, [items, query, open]);

  React.useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function select(item: Item) {
    onChange(item.id);
    setQuery(`${item.component_no} — ${item.name}`);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); select(results[highlighted]); }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <Input
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlighted(0);
          if (value) onChange(""); // typing over a prior selection un-selects it
        }}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
          {results.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => select(item)}
              className={cn(
                "flex w-full items-baseline gap-1.5 px-3 py-2 text-left text-sm hover:bg-accent",
                i === highlighted && "bg-accent",
              )}
            >
              <span className="font-medium">{item.component_no}</span>
              <span className="truncate text-muted-foreground">— {item.name}{item.is_job_work ? " (raw)" : ""}</span>
            </button>
          ))}
        </div>
      )}
      {open && query && results.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-card p-3 text-sm text-muted-foreground shadow-lg">
          No matching component.
        </div>
      )}
    </div>
  );
}
