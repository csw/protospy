// src/lib/virtual.ts — shared @tanstack/react-virtual helpers.

import { observeElementRect as defaultObserveRect } from "@tanstack/react-virtual";

/**
 * `observeElementRect` that falls back to a non-zero rect when the real one is
 * 0×0 — i.e. under jsdom (or any environment without layout), where
 * `getBoundingClientRect` reports zeros. The fallback lets the virtualizer render
 * items so component tests can assert on them; in a real browser the rect always
 * has real dimensions, so the fallback never fires and behaviour is unchanged.
 *
 * Consumed by every fixed-height virtualized viewer: the SSE event log
 * (`protospy/event-log`), the exchange table (`protospy/exchange-table`), and
 * the body viewers (`hex-view`, `markup-view`).
 */
export const observeElementRectWithFallback: typeof defaultObserveRect = (
  instance,
  cb,
) =>
  defaultObserveRect(instance, (rect) => {
    if (rect.width === 0 && rect.height === 0) {
      cb({ width: 400, height: 600 });
    } else {
      cb(rect);
    }
  });
