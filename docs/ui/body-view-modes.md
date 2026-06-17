# Body view-mode spec

This spec defines how the body pane's view-mode selector works across all
content types. It replaces the original fixed parsed/raw/hex model (PRO-336)
with a content-aware system where the available modes, their labels, and the
default depend on what the body actually contains.

Introduced by PRO-419; informs the PRO-411 children (image rendering, download,
HTML/XML, text detection, virtualization).

---

## Mode enum

A single flat enum covers every concrete view mode. No abstract "structured"
supertype — the set is small enough that a union is clearer.

| Mode        | Label        | What it shows                                                      |
| ----------- | ------------ | ------------------------------------------------------------------ |
| `tree`      | Tree         | JSON/NDJSON collapsible tree viewer (virtualized)                  |
| `formatted` | Formatted    | Syntax-highlighted, indented source (HTML, XML)                    |
| `rendered`  | Rendered     | Inline media rendering (images; eventually PDF, SVG)               |
| `text`      | Text         | Plain decoded Unicode text with line numbers (virtualized)         |
| `hex`       | Hex          | Hex + ASCII dump, 16 bytes/row (virtualized)                       |
| `summary`   | _(no label)_ | Content-type + size + download button; the "nothing to show" state |

`summary` is not a user-selectable mode — it is the implicit default when no
richer view is available. It does not appear in the mode selector.

---

## Content-kind detection

The decode pipeline classifies each body into a content kind based on the
`Content-Type` header and, for the `text` predicate, content sniffing. The
existing kinds (json, ndjson, text, binary) expand to:

| Kind   | Detection rule                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| json   | Content-Type contains `json` (excluding ndjson variants)                                                                                               |
| ndjson | Content-Type is `application/x-ndjson`, `application/ndjson`, `application/jsonl`, or ES NDJSON                                                                             |
| html   | `text/html`, `application/xhtml+xml`                                                                                                                   |
| xml    | `text/xml`, `application/xml`, `application/soap+xml`, `application/rss+xml`, `application/atom+xml`, and similar                                      |
| image  | `image/*`                                                                                                                                              |
| text   | All `text/*` not classified above, plus known textual `application/*` types (csv, javascript, yaml, toml, graphql, x-www-form-urlencoded); see PRO-415 |
| binary | Everything else                                                                                                                                        |

SSE responses (`text/event-stream`) and msearch paired views are **not** covered
by this spec — they use separate rendering paths (`StreamView`/`ChatStreamView`
and the Inspector-level Pairs tab respectively) that bypass BodyPane entirely.
The mode selector does not appear on those response panes. The request side of
an SSE or msearch exchange is a normal body and gets the mode selector.

### Text predicate

The `text` mode is available only when the body content is displayable as
Unicode text. Two paths:

1. **Proxy sent text chunks** (`{ "text": string }`): content is valid UTF-8 by
   construction. Text mode is available.
2. **Proxy sent binary chunks** (`{ "binary": base64 }`): text mode is available
   only if the Content-Type header declares a text-compatible charset that
   `TextDecoder` supports (e.g. `charset=utf-16`, `charset=iso-8859-1`). If no
   charset is declared and the chunks are binary, text mode is unavailable — the
   content failed the proxy's UTF-8 check and there is no declared encoding to
   try.

This predicate is computed once per body decode, not per mode switch.

---

## Available modes per content kind

Each content kind declares which modes are available. `hex` is always available.
`summary` is only present for binary (and is implicit, not selectable). `text`
availability depends on the text predicate above.

| Kind   | Available modes        | Default   |
| ------ | ---------------------- | --------- |
| json   | tree, text\*, hex      | tree      |
| ndjson | tree, text\*, hex      | tree      |
| html   | formatted, text\*, hex | formatted |
| xml    | formatted, text\*, hex | formatted |
| image  | rendered, hex          | rendered  |
| text   | text, hex              | text      |
| binary | summary, hex           | summary   |

\* Text is available when the text predicate is satisfied (almost always true
for these kinds, since they arrive as text chunks from the proxy; the predicate
matters for edge cases like a `text/html` body with a non-UTF-8 charset sent as
binary chunks).

---

## Default precedence

Each mode carries an integer precedence. When multiple modes are available, the
one with the lowest precedence value is the default. Precedence values are not
user-visible; they determine only the initial mode when the user has not made an
explicit selection.

| Mode      | Precedence | Rationale                                                   |
| --------- | ---------- | ----------------------------------------------------------- |
| tree      | 10         | The natural view for structured data                     |
| formatted | 10         | The natural view for markup                              |
| rendered  | 10         | The natural view for media                               |
| text      | 30         | Fallback for "it's text but we don't have a richer view" |
| hex       | 40         | Power-user opt-in                                        |
| summary   | 50         | Implicit; wins only when nothing else is available       |

Tie-breaking (precedence 10 ties): not expected in practice — each content kind
enables at most one precedence-10 mode. If a tie occurs, the mode listed first
in the kind's available-modes list wins.

---

## Per-direction mode state

Request and response bodies are independent — a JSON request and a PDF response
have different content kinds, different available modes, and different user
selections. The store holds mode state per direction.

### Store shape

```typescript
// Replaces the current single `bodyViewMode: BodyViewMode` (session state, not persisted)
interface BodyModeState {
  requestViewMode: ViewMode | null; // null = use default for content kind
  responseViewMode: ViewMode | null;
}

type ViewMode =
  | "tree"
  | "formatted"
  | "rendered"
  | "text"
  | "hex";
// "summary" is not in ViewMode — it is the implicit fallback, not a user selection
```

`null` means "use the default for whatever this body's content kind is." An
explicit value means the user chose that mode. If the user's stored mode is not
in the current body's available set (e.g. they selected `tree` on a JSON
response, then navigated to an exchange with an image response), fall back to
the default for the new content kind — do not force an invalid mode.

---

## UI: mode selector

Each body pane (request and response) gets its own mode selector in its header
strip. The selector shows only the modes available for that pane's content kind.

### Overflow

When space is constrained (e.g. a content kind with four available modes), the
selector should collapse lower-precedence modes behind
an overflow menu (ellipsis or similar affordance). The first N modes that fit are
shown as direct toggle buttons; the rest are in the overflow dropdown. The exact
breakpoint is an implementation detail, but the pattern is: **primary modes
visible, overflow for the rest**.

### Single-mode and two-mode cases

- **Binary (summary + hex):** The selector shows only a "Hex" toggle. Summary
  is the implicit default; clicking "Hex" switches to hex; clicking it again
  returns to summary. No multi-button toggle group needed.
- **Image (rendered + hex):** Same pattern — "Hex" toggle only, rendered is the
  default.
- **Text (text + hex):** Same — "Hex" toggle only.

When there are only two modes and one is the obvious default, a single toggle
button is cleaner than a two-item toggle group.

### Label source

The selector label for each mode comes from the "Label" column in the mode enum
table above. Labels are fixed per mode, not per content kind — `tree` is always
"Tree" whether the body is JSON or NDJSON.
