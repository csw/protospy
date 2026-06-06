import { X } from "lucide-react";
import { useStore } from "@ui/state/store";
import { matchesFilter, shortenTraceId, traceColor } from "@ui/lib/utils";
import { Button } from "./ui/button";
import { SearchInput } from "./ui/SearchInput";

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
      <SearchInput
        data-testid="filter-input-wrapper"
        className="flex-1"
        value={filter}
        onChange={setFilter}
        placeholder="Filter requests…"
      />

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
          {/* Stays accent-ink (chip = active surface, A2.4) rather than the
              ghost Button's neutral hover; size-4 override keeps it chip-sized. */}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setTraceFilter(null)}
            aria-label="Clear trace filter"
            className="size-4 shrink-0 text-accent-ink hover:bg-transparent hover:text-accent"
          >
            <X />
          </Button>
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
