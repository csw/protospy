import { Search, X } from "lucide-react";
import { useStore } from "@ui/state/store";
import { matchesFilter, shortenTraceId, traceColor } from "@ui/lib/utils";

export function FilterBar() {
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const traceFilter = useStore((s) => s.traceFilter);
  const setTraceFilter = useStore((s) => s.setTraceFilter);
  const ids = useStore((s) => s.ids);
  const exchanges = useStore((s) => s.exchanges);

  const totalCount = ids.length;
  const isFiltered = filter.length > 0 || traceFilter != null;
  const filteredCount = isFiltered
    ? ids.filter((id) => {
        const ex = exchanges.get(id);
        return (
          ex != null &&
          matchesFilter(ex, filter) &&
          (traceFilter == null || ex.traceId === traceFilter)
        );
      }).length
    : totalCount;

  return (
    <div className="flex items-center h-[36px] bg-bg border-b border-border px-3 gap-2 shrink-0">
      {/* Search input */}
      <div
        data-testid="filter-input-wrapper"
        className="flex items-center flex-1 gap-1.5 rounded-[4px] bg-bg-sub border border-border px-2.5 h-[24px] min-w-0 focus-within:border-border-focus"
      >
        <Search size={11} className="text-dim shrink-0" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter requests…"
          className="flex-1 bg-transparent border-none outline-none font-mono text-xs text-ink placeholder:text-dim min-w-0"
        />
        {filter.length > 0 && (
          <button
            onClick={() => setFilter("")}
            className="text-dim hover:text-ink transition-colors shrink-0 cursor-pointer"
            aria-label="Clear filter"
          >
            <X size={11} />
          </button>
        )}
      </div>

      {/* Trace filter chip */}
      {traceFilter != null && (
        <div className="flex items-center gap-1.5 rounded-full bg-accent-soft px-2 h-[22px] shrink-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: traceColor(traceFilter) }}
          />
          <span className="font-mono text-xs text-accent-ink">
            trace {shortenTraceId(traceFilter)}
          </span>
          <button
            onClick={() => setTraceFilter(null)}
            className="text-accent-ink hover:text-primary transition-colors cursor-pointer"
            aria-label="Clear trace filter"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Exchange count */}
      <span className="font-mono text-xs text-dim shrink-0 ml-auto">
        {isFiltered
          ? `${filteredCount} of ${totalCount}`
          : `${totalCount} request${totalCount !== 1 ? "s" : ""}`}
      </span>
    </div>
  );
}
