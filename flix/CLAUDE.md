# CLAUDE.md — elasticflix demo

Also read `docs/agents/python.md` at the repo root.

## Commands

```bash
uv run uvicorn elasticflix.main:app --reload   # run the demo
uv add <package>                               # add a dependency
uv run ruff check .                            # lint
uv run ruff format .                           # format
uv run pyright .                               # type check
uv run pytest -q                               # run tests (always pass -q when running as an agent)
uvx vulture src                                # check for dead code
```

Run all commands from `flix/` using `uv run`. (On the host macOS sandbox, run `cd flix/` once first — see `docs/agents/host-sandbox.md`.)

## Architecture

For the deep reference (full library/version table, per-endpoint ES query bodies, OTel setup details, unit-test mocking recipe with the right `ApiResponseMeta` shape, E2E fixture wiring), read [`ARCHITECTURE.md`](./ARCHITECTURE.md). The TL;DR below is enough for adding a route or template that fits an existing pattern — but if your change touches the FastAPI lifespan, OTel/telemetry setup, the ES client lifecycle, the loader script, the dual HTML/JSON response pattern, or the directory layout, you need the deep doc.

**Keep both current:** when you change the demo's stack, query patterns, OTel setup, testing approach, or directory structure, update `ARCHITECTURE.md`, the `## Architecture` section of `README.md`, and the TL;DR below in the same change. See [`docs/agents/tldr-maintenance.md`](../docs/agents/tldr-maintenance.md) for the regeneration prompt.

### TL;DR

**Stack.** FastAPI + uvicorn (standard extras), Jinja2 templates (Starlette `Jinja2Templates`), `elasticsearch[async]` 9.x (must match server major; `AsyncElasticsearch` in `main.py`, sync `Elasticsearch` in `loader.py`), `pydantic-settings` for the `Settings` singleton. OTel: `opentelemetry-sdk`/`-api`, `opentelemetry-instrumentation-fastapi`, `opentelemetry-instrumentation-aiohttp-client` (the ES client's transport), `opentelemetry-exporter-otlp-proto-http`. UI: HTMX 2.0.4 + Alpine.js 3.15.8, both from CDN pinned in `base.html`. Tests: `pytest`, `pytest-playwright` (E2E). Tooling: `ruff`, `pyright`, `uv` (lockfile `flix/uv.lock`).

**Data flow.** `elasticflix.main:app` is a FastAPI app whose lifespan calls `_init_telemetry()` (instruments aiohttp; exports OTLP only when `OTLP_ENDPOINT` is set; adds `ConsoleSpanExporter` if `DEBUG=true`) and opens an `AsyncElasticsearch` stored on `app.state.es`. **`FastAPIInstrumentor().instrument_app(app)` is called at module level, outside the lifespan — intentional, don't move it.** All route handlers reach the ES client via `request.app.state.es`. Responses are full-page Jinja2 `TemplateResponse`s by default; `<body hx-boost="true">` makes link clicks and form submits XHR body swaps with `pushState`, so the page feels SPA-like with zero client-side routing. Only `/suggest` branches on `HX-Request` — returning either an HTML `<ul>` fragment or `JSONResponse`.

**ES query patterns (one per endpoint — the variety is the point):** `GET /search` → `_msearch` (multi_match for hits + same query with `terms` agg on `genres`). `GET /movie/{id}` → `_doc/{id}` + `_search` `more_like_this` in parallel via `asyncio.gather`; with `?q=...` adds an `_msearch` for three-way fan-out (key protospy request-grouping demo). `GET /suggest` → `_search` `match_bool_prefix` on `title`. `GET /stats` → `_search` aggregations only (`terms` on `genres` top-20 + `histogram` on `vote_average`). `GET /health` → no ES call.

**Load-bearing details — don't break these:**

- `Settings` is a module-level singleton at `elasticflix.config.settings`. Import it directly; do not re-instantiate.
- `TemplateResponse` takes `request` **first**, then template name: `templates.TemplateResponse(request, "index.html", ctx)`. Wrong order is a recurring footgun.
- `_get_similar` silently swallows exceptions and returns `[]` — the "More Like This" section is then simply omitted. Don't add a 500 path here.
- Alpine `combobox` is registered via `Alpine.data(...)` inside an `alpine:init` listener in `base.html`, placed **before** the deferred Alpine CDN `<script>`. Re-ordering breaks combobox.
- ES client major must match the running ES server major (currently 9.x). Bumping one without the other will break loader + queries.
- `loader.py` is **not** imported by `main.py` — it's a standalone bulk-indexing script using the sync client. Don't add app imports that pull it in.

**Directory map (compressed; full annotations in `ARCHITECTURE.md`):**

- `src/elasticflix/main.py` — FastAPI app, OTel setup, all route handlers (`/`, `/search`, `/movie/{id}`, `/suggest`, `/stats`, `/health`)
- `src/elasticflix/config.py` — `Settings` singleton (`pydantic-settings`, env-driven)
- `src/elasticflix/templates/` — `base.html` (HTML shell, HTMX + Alpine CDN, all CSS), `index.html`, `item.html`, `search.html`, `stats.html`
- `loader.py` — one-shot bulk indexer (sync `Elasticsearch` client + `helpers.bulk`); reads `data/tmdb_5000_*.csv.gz`
- `tests/conftest.py` — session-scoped `live_server_url` fixture (uvicorn subprocess on a random free port) for E2E
- `tests/test_api.py` — unit tests (`TestClient` + `AsyncMock` patched at `elasticflix.main.*`; `NotFoundError` needs a real `ApiResponseMeta` with a `NodeConfig` — see ARCHITECTURE for the exact recipe)
- `tests/test_e2e.py` — Playwright E2E (requires running ES + loaded index; gated with `pytest -m e2e`)
- `data/` — committed gzipped TMDB CSVs (`tmdb_5000_movies.csv.gz`, `tmdb_5000_credits.csv.gz`)
- `pyproject.toml` / `uv.lock` — deps (always commit them together)
- `docker-compose.yaml` lives at the **repo root**, not in `flix/`

## Code Quality Requirements

Before reporting work as complete or committing, **all of the following must pass**:

```bash
uv run ruff check .
uv run ruff format .
uv run pyright .
uv run pytest -q -m "not e2e"   # unit/component
uv run pytest -m e2e -q         # e2e — needs Elasticsearch at localhost:9200
```

The e2e suite is part of the bar, not optional. It requires a running
Elasticsearch (with the demo index loaded); **you cannot start ES yourself**, so
if it's down, surface that to the user rather than skipping the run or reporting
done — see [`docs/agents/quality-gates.md`](../docs/agents/quality-gates.md) and
the "Failures are your fault" section of [`docs/agents/testing.md`](../docs/agents/testing.md).
All of these are also enforced automatically at commit time.

## Browser testing

To inspect network traffic during Chrome browser tests, use `read_network_requests` (the MCP tool) rather than injecting JavaScript event listeners. Clear the log with `clear: true` immediately before an action, then read it after to see exactly which requests fired and whether they were XHR or document loads.

## Committing

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/). Use scope `flix`:

```text
feat(flix): add autocomplete to search input
fix(flix): fix TemplateResponse argument order
build(flix): pin major versions for all dependencies
```

Always commit `uv.lock` alongside any changes to `pyproject.toml`.
