import { useEffect, useState } from "react";
import type { BodyState } from "@ui/state/types";
import { useStore } from "@ui/state/store";
import { decodeBody, type DecodeResult } from "@ui/body/decode";

type DecodeEntry =
  | { status: "done"; body: BodyState; result: DecodeResult }
  | { status: "failed"; body: BodyState };

/**
 * Decode a body asynchronously and (optionally) cache its decompressed byte
 * count back into the store. When `cacheTo` is provided, the resulting
 * `DecodeResult.decodedBytes` is written to `BodyState.decodedBytes` on the
 * exchange so other surfaces (timing view, list) can show a dual wire/decoded
 * size without re-running decode themselves.
 */
export function useDecodeBody(
  body: BodyState | undefined,
  cacheTo?: { exchangeId: number; direction: "request" | "response" },
): {
  loading: boolean;
  result: DecodeResult | null;
} {
  const [entry, setEntry] = useState<DecodeEntry | null>(null);
  const setBodyDecodedBytes = useStore((s) => s.setBodyDecodedBytes);

  useEffect(() => {
    if (body == null || !body.atEnd) {
      return;
    }
    let cancelled = false;
    decodeBody(body)
      .then((r) => {
        if (!cancelled) {
          setEntry({ status: "done", body, result: r });
          if (cacheTo != null && r.decodedBytes != null) {
            setBodyDecodedBytes(
              cacheTo.exchangeId,
              cacheTo.direction,
              r.decodedBytes,
            );
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEntry({ status: "failed", body });
        }
      });
    return () => {
      cancelled = true;
    };
    // cacheTo is rebuilt-each-render by callers; we depend on its
    // stable fields explicitly instead of the object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, cacheTo?.exchangeId, cacheTo?.direction, setBodyDecodedBytes]);

  if (body == null) return { loading: false, result: null };
  if (!body.atEnd) return { loading: false, result: null };

  // body.atEnd is true — either we have a completed entry for this body, or we're loading
  if (entry != null && entry.body === body) {
    return {
      loading: false,
      result: entry.status === "done" ? entry.result : null,
    };
  }
  return { loading: true, result: null };
}
