import type { SSEEvent } from "@ui/body/sse";
import { eventTypeBadgeClass } from "@ui/lib/utils";

function EventDataSummary({ event }: { event: SSEEvent }) {
  const summary =
    event.data.length > 80 ? event.data.slice(0, 80) + "…" : event.data;
  return (
    <span className="font-family-mono text-xs text-dim truncate">
      {summary}
    </span>
  );
}

export function EventsView({ events }: { events: SSEEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-dim text-xs">
        No events yet
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-auto">
      {events.map((event) => (
        <div
          key={event.index}
          className="flex items-center gap-3 px-3 min-h-[28px] py-1 border-b border-border hover:bg-bg-hl"
        >
          <span className="font-family-mono text-xs text-dim shrink-0 w-6 text-right">
            {event.index}
          </span>
          <span
            className={`font-family-mono text-xs px-1.5 py-0.5 rounded shrink-0 ${eventTypeBadgeClass(event.type)}`}
          >
            {event.type}
          </span>
          <div className="flex-1 min-w-0 overflow-hidden">
            <EventDataSummary event={event} />
          </div>
        </div>
      ))}
    </div>
  );
}
