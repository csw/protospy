# elasticflix Demo: Development Notes

## Overview

`demo/` is a FastAPI + Elasticsearch movie search app. Its purpose is to generate realistic, varied ES traffic for `protospy` to analyse. The app itself is secondary; the query patterns and OTel spans are the point.

## File Map

```
demo/
├── src/elasticflix/     # Python package
│   ├── main.py          # FastAPI app, OTel setup, all route handlers
│   ├── config.py        # pydantic-settings Settings singleton
│   └── templates/       # Jinja2 HTML templates
│       ├── base.html    # Full HTML shell (HTMX + Alpine.js from CDN)
│       ├── index.html   # Home page (extends base.html)
│       ├── search.html  # Results fragment (movie grid cards + genre facets)
│       ├── item.html    # Movie detail fragment
│       └── stats.html   # Stats fragment (genre table + vote histogram)
├── loader.py            # One-shot bulk indexing script (not imported by main.py)
├── tests/
│   ├── test_api.py      # pytest, all ES calls mocked
│   ├── test_e2e.py      # Playwright E2E tests (require running ES + data)
│   └── conftest.py      # session-scoped uvicorn fixture for E2E
├── data/
│   ├── tmdb_5000_movies.csv.gz   # not in git (see .gitignore in data/)
│   ├── tmdb_5000_credits.csv.gz  # not in git
│   └── .gitkeep
└── pyproject.toml
```

The `docker-compose.yaml` lives at the **repo root**, not inside `demo/`.

## ES Query Patterns Generated

Each endpoint exercises a different ES query type — this variety is the whole point:

| Endpoint | ES Operation |
|---|---|
| `/search` | `_msearch` — two requests: `multi_match` hits + `terms` agg (genres) |
| `/item/{id}` | `_doc/{id}` get-by-ID |
| `/suggest` | `_search` with `match_bool_prefix` (operator=and) on `title` |
| `/stats` | `_search` with `terms` agg (genres) + `histogram` agg (vote_average) |

## UI Stack

**HTMX** handles all server interactions — search, suggest, stats, and detail fetch. Every endpoint except `/` returns JSON by default and an HTML fragment when `HX-Request` is present:

```python
if request.headers.get("HX-Request"):
    return templates.TemplateResponse(request, "template.html", {...})
return JSONResponse({...})
```

Note: Starlette's `TemplateResponse` takes `request` as the **first** argument (not the template name).

**Alpine.js** handles all local UI state — combobox keyboard navigation and dismiss, active card highlighting, and scroll-to-detail. New UI features should follow this split: server data → HTMX, client state → Alpine.

The `combobox` and `pageState` Alpine components are registered in `base.html` via `Alpine.data()` inside an `alpine:init` listener, placed before the deferred Alpine CDN script.

## OTel Setup

OTel is configured in the FastAPI lifespan (startup/shutdown), not at module level. Key detail: `FastAPIInstrumentor().instrument_app(app)` is called **inside** the lifespan, after `app` is created, but the `app` object itself is created at module level. The Elasticsearch client automatically uses the globally configured tracer provider.

Traces are only exported when `OTLP_ENDPOINT` is set. `DEBUG=true` additionally logs spans to stdout via `ConsoleSpanExporter`.

## Elasticsearch Client

- **Async client** (`AsyncElasticsearch`) used in `main.py`, stored on `app.state.es`
- **Sync client** (`Elasticsearch`) used in `loader.py` (simpler for a script)
- Client version must stay in sync with server major version — see below

## Version Pinning

The Python client major version must match the ES server major version. Both are currently pinned to 9.x:

- `docker-compose.yaml`: `elasticsearch:9.3.1`
- `pyproject.toml`: `elasticsearch[async]>=9,<10`

If the server is upgraded to a new major version, both must be updated together. Using elasticsearch-py 9.x against ES 8.x causes all requests to fail with `BadRequestError(400, 'None')` — even `ping()`.

All other runtime dependencies are pinned by major version in `pyproject.toml`.

## Data Loader

`loader.py` reads gzipped CSVs from `demo/data/`:
- `tmdb_5000_movies.csv.gz` — movie metadata
- `tmdb_5000_credits.csv.gz` — cast/crew; director extracted via `job == "Director"`

Uses `gzip.open(..., "rt")` + stdlib `csv.DictReader`. Joins on `movie_id`. Bulk-indexes ~4800 documents using `elasticsearch.helpers.bulk`. The index is **deleted and recreated** on each run.

The `data/` directory has its own `.gitignore` that ignores `*.csv` files (the originals, if unzipped). The `.gz` files are committed.

## Testing

Unit tests live in `demo/tests/test_api.py`. They use FastAPI's `TestClient` (synchronous) with the ES client mocked via `unittest.mock.AsyncMock`. The mock patches happen at `elasticflix.main.*`:

```python
with (
    patch("elasticflix.main.AsyncElasticsearch", return_value=mock_es),
    patch("elasticflix.main.FastAPIInstrumentor"),
    patch("elasticflix.main.trace"),
):
    from elasticflix import main
    with TestClient(main.app) as client:
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

E2E tests live in `demo/tests/test_e2e.py`. They use Playwright against a real uvicorn subprocess (started by the session-scoped fixture in `conftest.py`). They require Elasticsearch running and the movies index loaded. Run with `uv run pytest -m e2e`.

## Code Quality

All checks run from `demo/`:

```bash
uv run ruff check .        # lint
uv run ruff format --check .  # format
uv run pyright .           # type-check
uv run pytest              # unit tests
uvx vulture src            # dead code
```

Pre-commit hooks at repo root cover ruff, ruff-format, pyright, uv-lock, and Conventional Commits. Always commit `demo/uv.lock` alongside `pyproject.toml` changes — the `uv-lock` hook will block the commit otherwise.
