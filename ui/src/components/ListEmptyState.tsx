// Empty-state for the exchange list, shared by both modes (rows in ExchangeList,
// table in ExchangeTable). `filtered` picks the "no match" copy over the
// first-run "no requests yet" copy.

export const EMPTY_STATE_NO_MATCH = "No requests match your filter";

export function ListEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-bg-pane">
      {filtered ? (
        <span className="font-ui text-xs text-dim">{EMPTY_STATE_NO_MATCH}</span>
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-center max-w-[260px]">
          <span className="font-ui text-sm font-medium text-ink-2">
            No requests yet
          </span>
          <span className="font-ui text-xs text-dim leading-relaxed">
            Traffic will appear here when requests flow through the proxy
          </span>
        </div>
      )}
    </div>
  );
}
