> Agent-facing architecture documentation. Keep this file in sync with the code **and** with the
> `## Architecture` section of `flix/README.md`.

# elasticflix — Architecture

## Purpose & overview

`flix/` is a FastAPI + Elasticsearch movie-search app whose sole purpose is to generate realistic,
varied ES traffic for the `protospy` proxy to observe. The app itself is secondary; the query
patterns and OTel spans are the point. It exposes a browser UI (HTMX + Alpine.js) and a JSON REST
API from the same endpoints via HTTP content negotiation.

## Libraries & tools

| Library / tool | Used for |
|---|---|
| **FastAPI** | ASGI web framework; routing, dependency injection, OpenAPI docs (`/docs`) |
| **uvicorn** | ASGI server (standard extras include WebSocket + HTTP/2 support) |
| **Jinja2** | Server-side HTML templating (`Jinja2Templates` via Starlette) |
| **elasticsearch[async]** (`>=9,<10`) | ES Python client — `AsyncElasticsearch` in the app, sync `Elasticsearch` in the loader |
| **pydantic-settings** | `Settings` singleton loaded from env vars via `BaseSettings` |
| **opentelemetry-sdk / api** | OTel SDK and API for tracing |
| **opentelemetry-instrumentation-fastapi** | Auto-instruments FastAPI request spans |
| **opentelemetry-instrumentation-aiohttp-client** | Auto-instruments aiohttp-backed ES client spans |
| **opentelemetry-exporter-otlp-proto-http** | Exports traces to an OTLP/HTTP collector |
| **HTMX** (`htmx.org@2.0.4`, CDN) | XHR-driven page swaps without client-side routing; `hx-boost` on `<body>` |
| **Alpine.js** (`alpinejs@3.15.8`, CDN) | Combobox keyboard nav, suggestion dismissal, form-submit on click |
| **pytest** | Unit tests (`test_api.py`) and E2E tests (`test_e2e.py`) |
| **pytest-playwright** | Browser automation for E2E tests |
| **ruff** | Linting and formatting |
| **pyright** | Static type checking |
| **uv** | Python package manager; lockfile at `flix/uv.lock` |

All CDN scripts are pinned to explicit versions in `base.html`. Runtime dep major versions are
pinned in `pyproject.toml`; the ES client major must match the server major (both 9.x).

## General design

### Dual HTML / JSON responses

All endpoints return **full-page HTML** by default (Jinja2 `TemplateResponse`). There is no
explicit `HX-Request` check for most routes — the same `TemplateResponse` is returned regardless.
HTMX's `hx-boost` intercepts link clicks and form submissions, swaps only `<body>`, and updates
the URL via `pushState`, so the page feels like a SPA without any client-side router.

The one exception is `/suggest`: it explicitly checks `request.headers.get("HX-Request")` and
returns either a raw `HTMLResponse` (a `<ul>` fragment, for HTMX) or a `JSONResponse`, because the
suggest endpoint is a true XHR (not a nav swap).

### Configuration

All settings are handled by a `pydantic-settings` `Settings` singleton (`config.py`). Values are
read from environment variables at startup; defaults cover local development. The singleton is
imported at module level in `main.py` as `settings`.

### OTel tracing

Tracing is initialised in the FastAPI lifespan (`_init_telemetry`). Spans are only exported when
`OTLP_ENDPOINT` is set; `DEBUG=true` additionally writes spans to stdout via
`ConsoleSpanExporter`. `AioHttpClientInstrumentor` is called inside `_init_telemetry`, and the ES
client automatically picks up the globally configured tracer provider.

`FastAPIInstrumentor().instrument_app(app)` is called at **module level** (outside the lifespan),
as noted by a comment in the code — this is intentional.

### ES client lifecycle

`AsyncElasticsearch` is created at startup and stored on `app.state.es`; it is closed during
shutdown. All route handlers access it via `request.app.state.es`.

## Architectural patterns

**Settings singleton** — `elasticflix.config.settings` is a module-level instance of `Settings`.
Import it directly; do not re-instantiate.

**`TemplateResponse` argument order** — Starlette's `TemplateResponse` takes `request` as the
**first** argument, then the template name:
```python
return templates.TemplateResponse(request, "index.html", ctx)
```

**`asyncio.gather` fan-out** — `/movie/{id}` fires two or three ES calls in parallel depending on
whether `q` is present, sharing trace context. This fan-out is intentional and is a key demo of
protospy's request-grouping display.

**Silent failure for `_get_similar`** — if the `more_like_this` query raises any exception, an
empty list is returned and the "More Like This" section is simply omitted from the rendered page.

**Alpine.js scoping** — the `combobox` component is registered via `Alpine.data()` inside an
`alpine:init` listener in `base.html`, placed before the deferred Alpine CDN `<script>` tag.

## File map

```
flix/
├── src/elasticflix/          # Python package
│   ├── __init__.py
│   ├── main.py               # FastAPI app, OTel setup, all route handlers
│   ├── config.py             # pydantic-settings Settings singleton
│   └── templates/            # Jinja2 HTML templates
│       ├── base.html         # Full HTML shell (HTMX + Alpine.js from CDN, all CSS)
│       ├── index.html        # Home / search results page (extends base.html)
│       ├── item.html         # Movie detail fragment (included by index.html)
│       ├── search.html       # Search results grid fragment (included by index.html)
│       └── stats.html        # Stats page (genre table + vote histogram)
├── loader.py                 # One-shot bulk indexing script; not imported by main.py
├── tests/
│   ├── conftest.py           # Session-scoped uvicorn fixture for E2E tests
│   ├── test_api.py           # Unit tests; ES client mocked with AsyncMock
│   └── test_e2e.py           # Playwright E2E tests (require running ES + loaded index)
├── data/
│   ├── tmdb_5000_movies.csv.gz   # TMDB 5000 Movie Dataset (committed)
│   ├── tmdb_5000_credits.csv.gz  # Cast/crew data (committed)
│   ├── .gitignore                # Ignores *.csv (unzipped originals)
│   └── .gitkeep
└── pyproject.toml
```

`docker-compose.yaml` lives at the **repo root**, not inside `flix/`.

## ES query patterns

Each endpoint exercises a different ES query type — this variety is the whole point:

| Endpoint | ES operation | Notes |
|---|---|---|
| `GET /search?q=...` | `_msearch` | Two sub-requests: `multi_match` on `title^2` + `overview` for hits; same query with `terms` agg on `genres` for facets. |
| `GET /movie/{id}` | `_doc/{id}` (get) + `_search` (`more_like_this`) | Always two parallel ES calls via `asyncio.gather`. `more_like_this` matches on `title`, `overview`, `tagline`. |
| `GET /movie/{id}?q=...` | `_doc/{id}` + `_search` (`more_like_this`) + `_msearch` | Three parallel ES calls — the heaviest fan-out. Demonstrates protospy request-grouping UI. |
| `GET /suggest?q=...` | `_search` | `match_bool_prefix` on `title` with `operator=and`; returns up to 5 title strings. |
| `GET /stats` | `_search` (aggregations only) | Two aggs: `terms` on `genres` (top 20) + `histogram` on `vote_average` (interval 1). |
| `GET /health` | — | No ES call; health check only. |

## UI navigation model

**Server-rendered, `hx-boost`-augmented.** Three URL patterns each render a complete page:

- `GET /` — home (search box only)
- `GET /search?q=...` — search results grid + genre facets
- `GET /movie/{id}?q=...` — search results grid + detail panel + "More Like This" similar titles

`<body hx-boost="true">` makes every `<a>` and `<form>` submission an XHR body swap with
`pushState`. Because the server is stateless, reload/back/forward/bookmark all work natively
without client-side state.

The only true XHR endpoint is `/suggest`, which returns an HTML `<ul>` fragment (or JSON) — it
never causes a navigation.

**Alpine.js** handles only local UI state: combobox keyboard navigation (arrow keys, Enter,
Escape), suggestion dismissal on outside click, and `form.requestSubmit()` on suggestion click.
New UI features should follow this split: server data → boosted nav (or HTMX); local state →
Alpine.

## Data loader

`loader.py` is a standalone script (not imported by `main.py`). It:

1. Reads `tmdb_5000_credits.csv.gz` to build a `movie_id → director` map.
2. Reads `tmdb_5000_movies.csv.gz` with `gzip.open(..., "rt")` + `csv.DictReader`.
3. Deletes and recreates the `movies` index (applying `MAPPINGS` with explicit field types).
4. Bulk-indexes ~4800 documents via `elasticsearch.helpers.bulk`.

It uses the synchronous `Elasticsearch` client (simpler for a script). It tries to import
`elasticflix.config.settings` for the ES URL/index; falls back to env vars if not importable.

## Testing

### Unit tests (`test_api.py`)

Use FastAPI's `TestClient` (synchronous) with the ES client replaced by `AsyncMock`. The mock
patches happen at `elasticflix.main.*`:

```python
with (
    patch("elasticflix.main.AsyncElasticsearch", return_value=mock_es),
    patch("elasticflix.main.FastAPIInstrumentor"),
    patch("elasticflix.main.trace"),
):
    import elasticflix.main
    with TestClient(elasticflix.main.app) as client:
        ...
```

`NotFoundError` requires a real `ApiResponseMeta` with a `NodeConfig` (not `None`):

```python
from elastic_transport import ApiResponseMeta, HttpHeaders, NodeConfig

meta = ApiResponseMeta(
    status=404, http_version="1.1", headers=HttpHeaders(), duration=0.1,
    node=NodeConfig(scheme="http", host="localhost", port=9200),
)
raise NotFoundError(message="not found", meta=meta, body={"found": False})
```

### E2E tests (`test_e2e.py`)

Use Playwright against a real uvicorn subprocess started by the session-scoped `live_server_url`
fixture in `conftest.py`. The fixture binds to a random free port so it does not conflict with a
dev server on 8000.

Require Elasticsearch running and the movies index loaded. Run with:
```bash
uv run pytest -m e2e -v
```

Coverage areas include: search, autocomplete (keyup/click/keyboard nav/dismiss), movie detail +
"More Like This" panel, chained navigation from similar items, genre facets, stats page, URL
correctness (`pushState`), back button, reload, and deep-link navigation.
