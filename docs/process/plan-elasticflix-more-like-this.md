# Elasticflix: "More Like This" on Movie Detail

## Context

protospy needs traffic where a single inbound HTTP request fans out to **multiple backend ES requests sharing one `traceparent`**, so the protospy UI can demo grouping. Today every elasticflix endpoint makes either one `_search` call or one `_msearch` call — from protospy's perspective that's a single backend request per inbound request. Nothing exercises the grouping path.

This plan adds a "More Like This" panel to the movie-detail view. The `/item/{id}` handler will fan out to two parallel ES requests — `GET movies/_doc/{id}` plus `_search` with `more_like_this` — which the elasticsearch-py OTel instrumentation will emit as two child spans of the FastAPI request span. Both will share the same trace context, so the propagated `traceparent` header on the wire is identical and protospy can group them.

The user-visible result is a "More Like This" strip below the existing detail panel. Clicking an entry HTMXes a new `/item/{id}` into the same panel, so users naturally chain into more grouped traces.

## Approach

### 1. Endpoint changes — [demo/src/elasticflix/main.py:113-126](../../demo/src/elasticflix/main.py#L113-L126)

Replace the single `es.get` call with two helper coroutines run in parallel via `asyncio.gather`:

- `_get_movie(es, id)` — wraps `es.get`; returns `None` on `NotFoundError` so the gather doesn't unwind.
- `_get_similar(es, id)` — runs `es.search` with a `more_like_this` query referencing the doc by `_id` (so it doesn't depend on first knowing the doc's fields). Returns `[]` on any exception — similar-search failures must not break the detail view.

Use `more_like_this` with `like: [{"_index": ..., "_id": id}]`, `fields: ["title", "overview", "tagline"]`, `min_term_freq=1`, `min_doc_freq=2`, `size=6`, `_source=["title", "release_date", "genres", "vote_average"]`. MLT internally fetches term vectors for the referenced doc, so it can run concurrently with the get.

Why parallel rather than sequential get-then-search: both spans then *overlap* in the trace, which is the more interesting protospy demo. Sequential would also satisfy "shared traceparent" but would just stack two spans end-to-end.

After gather: if `movie_resp is None`, raise `HTTPException(404)`. Otherwise pass `{"movie": ..., "similar": ...}` to the template / JSON response.

**JSON shape change:** `/item/{id}` previously returned the movie source directly. It will now return `{"movie": {...}, "similar": [...]}`. This is a breaking change to the JSON contract, but the JSON path is only used by tests; the production UI uses HX-Request.

### 2. Template — [demo/src/elasticflix/templates/item.html](../../demo/src/elasticflix/templates/item.html)

Append a "More Like This" section (only rendered when `similar` is non-empty), using a `<ul>` of compact rows that HTMX into the same `#detail` target as the existing movie cards do — same `hx-get`/`hx-target`/`hx-swap` pattern as [search.html:12-15](../../demo/src/elasticflix/templates/search.html#L12-L15).

### 3. CSS — [demo/src/elasticflix/templates/base.html](../../demo/src/elasticflix/templates/base.html) (style block, after `.detail-overview` at line 356)

Add `.similar-panel`, `.similar-heading`, `.similar-list`, `.similar-item`, `.similar-item-title`, `.similar-item-year`. Use the existing design tokens (`--surface`, `--border`, `--accent`, `--text-muted`, `--font-display`). The list should look like compact, single-line clickable rows that visually echo the movie cards (border-left accent on hover).

### 4. Unit tests — [demo/tests/test_api.py](../../demo/tests/test_api.py)

- Extend `make_mock_es` to accept both a `get_response` and a `search_response` simultaneously (it already supports each separately).
- Update `MOCK_GET_RESPONSE` consumers and add a `MOCK_SIMILAR_RESPONSE` (mirrors search hits shape).
- Update `test_item_found` to assert the new JSON shape: `body["movie"]["title"] == "Days of Heaven"` and `isinstance(body["similar"], list)`.
- Add `test_item_htmx_renders_similar`: HX-Request, assert `"More Like This"` and a similar-movie title appear in the response HTML.
- Add `test_item_similar_failure_is_silent`: configure `mock_es.search.side_effect = Exception(...)`, assert the endpoint still returns 200 with `similar == []`.
- `test_item_not_found` keeps working: `mock_es.get.side_effect = _not_found_error()`. Make sure `mock_es.search` is also mocked (with anything) since both calls fire in parallel — without this the test could surface unexpected behavior from an un-stubbed AsyncMock.

### 5. E2E tests — [demo/tests/test_e2e.py](../../demo/tests/test_e2e.py)

Match the existing Playwright pattern (each test marked `@pytest.mark.e2e`, uses the `page` fixture). Use "star wars" as the seed query — it's already used elsewhere in `test_e2e.py` so we know it returns deterministic results from the loaded TMDB data.

- `test_movie_detail_shows_more_like_this` — navigate from search → click "Star Wars (1977)" card → assert the detail panel shows the existing fields (`George Lucas`, `1977`) AND that a `.similar-panel` (or whatever class is chosen) is visible with the heading "More Like This" and at least one `.similar-item`.
- `test_more_like_this_navigation` — click the first `.similar-item` from the previous test scenario; assert `#detail` swaps to a different movie (different `.detail-title` text) and that another "More Like This" panel renders below it. This exercises the user flow of chaining detail views, which is exactly the path that produces multiple grouped traces in protospy.

Both tests assume Elasticsearch is running and the index is loaded — same precondition as the other E2E tests.

### 6. Docs — [docs/demo-dev.md](../demo-dev.md)

- **ES Query Patterns table** (line 38): change `/item/{id}` row to two rows or to a combined cell: `_doc/{id}` get-by-ID **+** `_search` with `more_like_this` (parallel, shared trace). Add a sentence under the table explaining that this is intentional — to produce grouped backend requests for protospy.
- **UI Stack section**: brief mention of the "More Like This" strip as another HTMX surface.
- **Testing section**: note the new test cases.

## Critical files

- [demo/src/elasticflix/main.py](../../demo/src/elasticflix/main.py) — endpoint logic (main agent edits this)
- [demo/src/elasticflix/templates/item.html](../../demo/src/elasticflix/templates/item.html) — template
- [demo/src/elasticflix/templates/base.html](../../demo/src/elasticflix/templates/base.html) — CSS additions
- [demo/tests/test_api.py](../../demo/tests/test_api.py) — unit test updates
- [demo/tests/test_e2e.py](../../demo/tests/test_e2e.py) — Playwright test additions
- [docs/demo-dev.md](../demo-dev.md) — docs update
- `docs/process/plan-elasticflix-more-like-this.md` — copy of this plan, written at the end for later reference

## Execution: subagent delegation

Per the user's request to delegate to lighter-weight subagents where appropriate. The main agent owns work that requires careful async/tracing correctness or end-to-end verification; mechanical edits with well-defined diffs go to Haiku subagents.

1. **Main agent** — modify `main.py`. Async correctness, OTel context propagation, and graceful-degradation logic warrant doing this inline.
2. **Haiku subagent** — apply the template changes to `item.html` and the matching CSS additions to `base.html`. Brief with the exact markup + style tokens to use.
3. **Haiku subagent** — update `test_api.py` per spec above and run `cd demo && uv run pytest -q` until green. Report any failures.
4. **Haiku subagent** — add the new E2E tests to `test_e2e.py`, following the existing `@pytest.mark.e2e` + `page` fixture pattern.
5. **Haiku subagent** — update `docs/demo-dev.md` per spec above.
6. **Main agent** — run the full quality gate: `cd demo && uv run ruff check . && uv run ruff format . && uv run pyright . && uv run pytest -q && uv run pytest -m e2e` (the e2e step requires a running ES with the movies index loaded).
7. **Main agent** — manual browser walkthrough + trace-level verification (see Verification below).
8. **Main agent** — copy this plan file to `docs/process/plan-elasticflix-more-like-this.md` so the design and verification steps are checked into the repo for later reference.

## Verification

**Quality gate** (must pass clean):

```bash
cd demo
uv run ruff check .
uv run ruff format .
uv run pyright .
uv run pytest -q          # unit tests (mocked ES)
uv run pytest -m e2e      # Playwright tests; requires ES running and index loaded
```

**Manual browser walkthrough** (requires real ES with the movies index loaded — see [docs/demo-dev.md:84-92](../demo-dev.md#L84-L92)):

1. Start ES via the repo-root `docker-compose.yaml`; load data with `uv run python loader.py` from `demo/`.
2. Start the app: `cd demo && uv run uvicorn elasticflix.main:app --reload`.
3. Open the app in a browser, search for a movie (e.g. `heaven`), click a result.
4. Verify the detail panel renders **and** a "More Like This" strip appears below it with 4-6 entries.
5. Click one of the similar entries — the detail panel should swap to that movie and show its own "More Like This" set.
6. Hit `/item/<id>` directly with `curl` (no HX-Request) and confirm the JSON shape is `{"movie": {...}, "similar": [...]}`.

**Trace-level verification** (the actual feature being demoed):

1. With `OTLP_ENDPOINT` set to a collector (or `DEBUG=true` for `ConsoleSpanExporter`), trigger a `/item/{id}` request and confirm two `Elasticsearch` client spans appear under one FastAPI request span, both sharing the same `trace_id`. Once protospy itself is running, this is what enables grouping in its UI.
