// src/components/protospy/trace-rail.tsx
// Lane-packed trace bars to the left of the list. ONE bar per multi-member trace,
// from the first member's top edge to the last member's bottom edge; overlapping
// traces are greedily packed into non-overlapping lanes.
//
// Virtualization note: the rail must place bars for traces whose members may be
// off-screen, so it does NOT read DOM. It takes the FULL ordered trace-id list
// (cheap — bounded by the filtered set) plus rowTop/rowBottom accessors from the
// virtualizer. Single-member traces never take a lane (the row's left border is
// enough); they're filtered out by packLanes.

"use client";

import { useMemo } from "react";
import { cn } from "@ui/lib/utils";
import { traceColorVar } from "@ui/lib/tokens";

interface TraceInterval {
  traceId: string;
  first: number;
  last: number;
  count: number;
  lane: number;
}

/** Greedy interval packing, sorted by first index. Exported for unit tests. */
export function packLanes(traceIds: readonly (string | null)[]): {
  intervals: TraceInterval[];
  laneCount: number;
} {
  const spans = new Map<string, Omit<TraceInterval, "lane">>();
  traceIds.forEach((id, i) => {
    if (!id) return;
    const s = spans.get(id) ?? { traceId: id, first: i, last: i, count: 0 };
    s.last = i;
    s.count += 1;
    spans.set(id, s);
  });

  const sorted = [...spans.values()]
    .filter((s) => s.count > 1)
    .sort((a, b) => a.first - b.first);

  const laneEnds: number[] = [];
  const intervals = sorted.map((s) => {
    let lane = laneEnds.findIndex((end) => end < s.first);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(s.last);
    } else {
      laneEnds[lane] = s.last;
    }
    return { ...s, lane };
  });

  return { intervals, laneCount: laneEnds.length };
}

const LANE_W = 3;
const LANE_GAP = 3;
const PAD_L = 5;
const PAD_R = 4;

export function traceRailWidth(laneCount: number): number {
  return (
    PAD_L + PAD_R + laneCount * LANE_W + Math.max(0, laneCount - 1) * LANE_GAP
  );
}

export interface TraceRailProps {
  /** Full ordered list of trace ids, one per visible-or-not list row. */
  traceIds: readonly (string | null)[];
  /** px offset of a row's top / bottom edge — from the virtualizer. */
  rowTop: (index: number) => number;
  rowBottom: (index: number) => number;
  activeTraceId?: string | null;
  onHoverTrace?: (traceId: string | null) => void;
  onSelectTrace?: (traceId: string) => void;
  className?: string;
}

export function TraceRail({
  traceIds,
  rowTop,
  rowBottom,
  activeTraceId,
  onHoverTrace,
  onSelectTrace,
  className,
}: TraceRailProps) {
  const { intervals, laneCount } = useMemo(
    () => packLanes(traceIds),
    [traceIds],
  );
  const width = traceRailWidth(laneCount);

  return (
    <div
      className={cn("relative shrink-0 border-r bg-background", className)}
      style={{ width }}
      onMouseLeave={() => onHoverTrace?.(null)}
    >
      {intervals.map((iv) => {
        const top = rowTop(iv.first) + 4;
        const height = rowBottom(iv.last) - rowTop(iv.first) - 8;
        const left = PAD_L + iv.lane * (LANE_W + LANE_GAP);
        const dimmed = activeTraceId != null && activeTraceId !== iv.traceId;
        return (
          <button
            key={iv.traceId}
            type="button"
            aria-label={`Filter to trace ${iv.traceId}`}
            onMouseEnter={() => onHoverTrace?.(iv.traceId)}
            onClick={() => onSelectTrace?.(iv.traceId)}
            className={cn(
              "absolute rounded-[1.5px] transition-[opacity,transform] duration-100",
              "hover:scale-x-[1.6] focus-visible:scale-x-[1.6]",
              "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-0",
              dimmed && "opacity-20",
            )}
            style={{
              top,
              height,
              left,
              width: LANE_W,
              background: traceColorVar(iv.traceId),
            }}
          />
        );
      })}
    </div>
  );
}
