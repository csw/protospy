// Body view-mode framework (PRO-420), implementing docs/ui/body-view-modes.md.
//
// Pure logic only — no React, no DOM. The decode pipeline classifies a body
// into a `ContentKind` and computes the `textAvailable` predicate; this module
// turns that into the set of selectable view modes, the default mode, and the
// resolution of a user's stored selection against the current body.

/**
 * Every concrete view mode. `summary` is the binary "nothing richer to show"
 * state (content-type + size + download); it is a real selectable mode and the
 * default for binary bodies, so every kind's default renders as a pressed
 * segment in the selector (no lone deselectable toggle). SSE and msearch paired
 * views are intentionally absent: per docs/ui/body-view-modes.md they bypass
 * BodyPane via separate rendering paths (StreamView/ChatStreamView and the
 * Inspector Pairs tab), so they are not view modes here.
 */
export type ViewMode =
  | "tree"
  | "formatted"
  | "rendered"
  | "text"
  | "summary"
  | "hex";

/**
 * The mode that actually drives rendering. Now identical to `ViewMode` (every
 * mode, including `summary`, is selectable); kept as a named alias for the
 * render-side call sites that resolve a stored selection into a concrete mode.
 */
export type ResolvedMode = ViewMode;

/** Content kinds the decode pipeline classifies a body into (PRO-420). */
export type ContentKind =
  | "json"
  | "ndjson"
  | "html"
  | "xml"
  | "image"
  | "text"
  | "binary";

/** Fixed, kind-independent labels from the spec's mode-enum table. */
export const MODE_LABELS: Record<ViewMode, string> = {
  tree: "Tree",
  formatted: "Formatted",
  rendered: "Rendered",
  text: "Text",
  summary: "Summary",
  hex: "Hex",
};

/**
 * Default precedence (lower wins). Used only to pick the initial mode when the
 * user has not chosen one; never user-visible. `summary` wins only when nothing
 * else is available (binary).
 */
export const MODE_PRECEDENCE: Record<ResolvedMode, number> = {
  tree: 10,
  formatted: 10,
  rendered: 10,
  text: 30,
  hex: 40,
  summary: 50,
};

/** Append `text` (when available) and the always-present `hex` to a base set. */
function withTextAndHex(base: ViewMode[], textAvailable: boolean): ViewMode[] {
  return [...base, ...(textAvailable ? (["text"] as ViewMode[]) : []), "hex"];
}

/**
 * The user-selectable modes for a content kind, in display order (richest
 * first, `hex` last). Every kind's default is included as a selectable segment —
 * binary returns `["summary", "hex"]` so `summary` renders as a pressed default
 * rather than an absent button.
 */
export function selectableModes(
  kind: ContentKind,
  textAvailable: boolean,
): ViewMode[] {
  switch (kind) {
    case "json":
    case "ndjson":
      return withTextAndHex(["tree"], textAvailable);
    case "html":
    case "xml":
      return withTextAndHex(["formatted"], textAvailable);
    case "image":
      return ["rendered", "hex"];
    case "text":
      // Text kind is text by construction; text mode is always available.
      return ["text", "hex"];
    case "binary":
      return ["summary", "hex"];
  }
}

/** The default (initial) resolved mode for a content kind — lowest precedence. */
export function defaultMode(
  kind: ContentKind,
  textAvailable: boolean,
): ResolvedMode {
  if (kind === "binary") return "summary";
  const modes = selectableModes(kind, textAvailable);
  return modes.reduce((best, m) =>
    MODE_PRECEDENCE[m] < MODE_PRECEDENCE[best] ? m : best,
  );
}

/**
 * Resolve a stored selection against the current body. A stored mode that is
 * not selectable for this kind (e.g. `tree` carried onto an image body) falls
 * back silently to the kind's default — never forces an invalid mode. `null`
 * means "use the default".
 */
export function resolveMode(
  stored: ViewMode | null,
  kind: ContentKind,
  textAvailable: boolean,
): ResolvedMode {
  if (stored != null && selectableModes(kind, textAvailable).includes(stored)) {
    return stored;
  }
  return defaultMode(kind, textAvailable);
}
