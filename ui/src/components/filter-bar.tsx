// src/components/protospy/filter-bar.tsx
// App chrome row 2. Binds straight to the store: the input is controlled by
// `filter`, the active-trace chip reflects `traceFilter`, and the right-aligned
// count derives from the visible vs. total ids. Surface noun is always
// "requests" — never "exchanges".

import { Search, X } from "lucide-react";
import { cn } from "@ui/lib/utils";
import { traceColorVar, shortTraceId } from "@ui/lib/tokens";
import { useStore, selectVisibleIds } from "@ui/state/store";
import { Input } from "@ui/components/ui/input";

export interface FilterBarProps {
  /** app-shell passes a ref so `/` can focus the field; optional. */
  inputRef?: React.Ref<HTMLInputElement>;
}

export function FilterBar({ inputRef }: FilterBarProps) {
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const traceFilter = useStore((s) => s.traceFilter);
  const setTraceFilter = useStore((s) => s.setTraceFilter);
  const visible = useStore((s) => selectVisibleIds(s).length);
  const total = useStore((s) => s.ids.length);
  const filtered = visible !== total;

  return (
    <div className="flex h-filterbar shrink-0 items-center gap-2 border-b bg-background px-gutter-x">
      <div className="relative flex min-w-0 flex-1 items-center">
        <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by path, method, status…"
          className="h-7 border-0 bg-transparent pl-8 font-mono text-sm shadow-none focus-visible:ring-0"
          aria-label="Filter requests"
        />
      </div>

      {/* Active trace chip — only when filtered to a trace; accent surface + clear */}
      {traceFilter && (
        <button
          type="button"
          onClick={() => setTraceFilter(null)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-2 py-0.5 font-mono text-xs text-accent-foreground hover:brightness-95"
        >
          <span
            className="size-2 rounded-full"
            style={{ background: traceColorVar(traceFilter) }}
            aria-hidden
          />
          trace {shortTraceId(traceFilter)}
          <X className="size-3" />
        </button>
      )}

      <span
        className={cn(
          "shrink-0 font-mono text-xs text-muted-foreground",
          filtered && "text-secondary-foreground",
        )}
      >
        {filtered
          ? `${visible} of ${total}`
          : `${total} ${total === 1 ? "request" : "requests"}`}
      </span>
    </div>
  );
}
