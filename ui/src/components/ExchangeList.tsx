import type { Exchange } from "@ui/state/reducer";
import { EmptyState } from "./ui/EmptyState";
import { SectionHeader } from "./ui/SectionHeader";
import { ExchangeListItem } from "./ExchangeListItem";

interface Props {
  exchanges: Exchange[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function ExchangeList({ exchanges, selectedId, onSelect }: Props) {
  return (
    <div className="flex flex-col h-full overflow-hidden border-r border-border">
      {/* Toolbar */}
      <div className="flex items-center px-3 h-7 shrink-0 bg-bg-sub border-b border-border-strong">
        <SectionHeader>
          {exchanges.length} exchange{exchanges.length !== 1 ? "s" : ""}
        </SectionHeader>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-bg-pane">
        {exchanges.length === 0 ? (
          <EmptyState>No exchanges</EmptyState>
        ) : (
          exchanges.map((ex) => (
            <ExchangeListItem
              key={ex.id}
              exchange={ex}
              selected={ex.id === selectedId}
              onSelect={() => onSelect(ex.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
