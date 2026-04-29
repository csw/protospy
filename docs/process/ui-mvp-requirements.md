# UI MVP requirements

## Overview

The next step for protospy is to create an MVP UI as a React SPA for live HTTP traffic monitoring. It will connect to the protospy server, subscribe to events with Server-Sent Events, display a live list of HTTP exchanges, and show their details. This only needs to work for local development at this stage.

The events sent to the browser as JSON are defined in @src/proxy/event.rs, with generated TypeScript bindings in @bindings/.

The focus of this is displaying request and response bodies in readable decompressed form, with JSON pretty-printed. Paths, query strings, content-type, and status should be visible; others headers should be an expandable detail, but not shown by default.

The motivating use case for this is to show large, complex Elasticsearch request and response bodies together, to allow inspection of complex queries and their search results. Keep this in mind.

At this stage, we need to create a high-level plan for the MVP, based on these requirements.

## Functional requirements

- Display traffic from the first service in the instance info document at `/info`
- Read events from protospy via SSE at `/service/{name}/events`
- Associate events with HTTP exchanges
- Show a live, scrollable list of HTTP exchanges, on the left side
- Allow selecting an exchange to display its details
- Show request and response panes side by side
- Update exchange data as more events arrive; show a request before the response is seen
- Show an indicator for whether the protospy connection is active
- Reconnect automatically, preserving existing exchanges
- Run from the Vite dev server, proxying traffic to protospy on port 3100
- Work in Chrome
- Light/dark mode selector

Per-exchange information to show:
  - Method
  - Path
  - Query string
  - Request body
  - Status
  - Content-Type
  - Response body
  - Elapsed time

Bodies:
  - Decode base64-encoded binary bodies
  - Decompress bodies with compressed Content-Encodings for display, using the compression streams API
  - Pretty-print JSON bodies
  - Display other textual bodies as plain text
  - Do not attempt to display binary bodies (images etc.)

## Architecture

This will be implemented as a React SPA using TypeScript and Vite. This will use a monorepo approach, with the front end application living under `ui/`, and using the TypeScript bindings in `bindings/`. (These could be moved under `ui/` if that would be a significant improvement.)

The UI and UX should be fairly simple at this stage. However, the UI/CSS/design framework should be something that both supports the functional needs of the UI well and would likely lend itself to higher levels of design and polish later.

## UI

Refer to the UI sketch in `protospy-body-inspector_1.html`, from previous work. A simplified version would be fine to start with, but this is the general design to use. For now, ignore the stream/inspect/routes/traces mode selector and the other modes it suggests. The UI should use the Industrial Light/Dark themes from `protospy-themes-v2_1.html` as light and dark modes. (We can adjust it as needed.)

Some prior discussion around it:

Layout: narrow request list on the left (enough to see method + path + status + maybe a timestamp), large dual-pane body viewer taking up the bulk of the screen. The list stays visible so you can jump between requests without losing context, but it's subordinate.

Body rendering: syntax-highlighted, pretty-printed JSON with line numbers, scrollable independently. 80-column readable width means around 640px at a reasonable monospace size — both panes can fit that on a 1200px+ viewport. Collapsible JSON nodes would be a natural enhancement but I'll sketch the flat readable form.

Query params: shown as a structured key-value table above the request body rather than buried in a raw URL string. For Elasticsearch this matters — ?pretty, ?filter_path=, ?routing= are meaningful.

The list column — each item shows req 1.8K / res 12.4K as a size indicator so you can scan for interesting requests before clicking. The body preview on the fourth item shows the first fragment of the request body, which is often enough to know if that's the query you're hunting. The selected row inverts to black as in the other sketches.

The query params strip — filter_path, routing, and pretty are shown as structured key-value pairs rather than as a raw URL fragment. For Elasticsearch work this matters: filter_path=hits.hits._source,hits.total,aggregations is a meaningful optimization decision that you'd want to read clearly.

The body panes — both scroll independently. The request body has a highlighted band on the multi_match clause (lines 5–12), which is the kind of affordance you'd use when you've searched within the body. The response pane uses inline fold-hints like … 16 more hits and … 12 year buckets so the document structure stays navigable without hiding content behind clicks.

Industrial Light is probably the most immediately usable theme for daily work — it doesn't announce itself the way the brutalist ones do, it just reads clearly. The steel-blue selection fill on the list (rather than an inversion) is the conventional choice and happens to work better for a light theme where high-contrast inversion reads harsh. The topbar and statusbar use accent stripes rather than full fills, which keeps the chrome lighter and puts more visual weight where it belongs — in the JSON bodies.

Industrial Light vs Dark is the strongest matched pair of the bunch. The ground color temperature is the same (cool gray vs cool dark), the accent is the same steel blue, and the zone structure is identical. These could ship as a system-respects-preference light/dark pair without any visual discontinuity when you switch.

## Policy

  - Rely on off-the-shelf libraries, UI/CSS frameworks, etc. as much as possible, rather than DIY implementations
  - Use current versions of popular, maintained libraries
  - Prefer simple, modern tools and approaches unless they will be a dead end for future development
  - Check the Internet for significant new developments since your training data cutoff, using Sonnet subagents
  - Discuss this, talk through alternatives and design decisions, and capture significant decisions in the plan, with rationale
  - Bring up concerns if I'm missing something or some of these requirements should be reconsidered

## Out of scope for now

  - Rust app integration (build process, embedding, production, etc.)
  - Handling of very large bodies
  - Supporting browsers other than Chrome
  - Aggregation, filtering, summarization, etc.

## Key decisions to make

  - What UI/CSS/design framework to use
  - What React state management approach to use
