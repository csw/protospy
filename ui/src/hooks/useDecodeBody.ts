import { useEffect, useState } from "react";
import type { BodyState } from "@ui/state/reducer";
import { decodeBody, type DecodeResult } from "@ui/body/decode";

type DecodeEntry =
  | { status: "done"; body: BodyState; result: DecodeResult }
  | { status: "failed"; body: BodyState };

export function useDecodeBody(body: BodyState | undefined): {
  loading: boolean;
  result: DecodeResult | null;
} {
  const [entry, setEntry] = useState<DecodeEntry | null>(null);

  useEffect(() => {
    if (body == null || !body.atEnd) {
      return;
    }
    let cancelled = false;
    decodeBody(body)
      .then((r) => {
        if (!cancelled) {
          setEntry({ status: "done", body, result: r });
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
  }, [body]);

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
