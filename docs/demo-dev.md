# elasticflix Demo: Development Notes

## Overview

`demo/` is a FastAPI + Elasticsearch movie search app. Its purpose is to generate realistic, varied ES traffic for `protospy` to analyse. The app itself is secondary; the query patterns and OTel spans are the point.

## File Map

```
demo/
├── main.py          # FastAPI app, OTel setup, all route handlers
├── config.py        # pydantic-settings Settings singleton
├── loader.py        # One-shot bulk indexing script (not imported by main.py)
├── templates/       # Jinja2 HTML templates
│   ├── base.html    # Full HTML shell (HTMX + Pico CSS from CDN)
│   ├── index.html   # Home page (extends base.html)
│   ├── search.html  # Results fragment (movie grid cards)
│   ├── item.html    # Movie detail fragment
│   └── stats.html   # Stats fragment (genre table + vote histogram)
├── tests/
│   └── test_api.py  # pytest, all ES calls mocked
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

## HTMX / REST Duality

Every endpoint except `/` returns JSON by default and an HTML fragment when the `HX-Request` header is present. The pattern used throughout `main.py`:

```python
if request.headers.get("HX-Request"):
    return templates.TemplateResponse(request, "template.html", {...})
return JSONResponse({...})
```

Note: Starlette's `TemplateResponse` now takes `request` as the **first** argument (not the template name). The old `TemplateResponse(name, {"request": request, ...})` form triggers a deprecation warning.

## OTel Setup

OTel is configured in the FastAPI lifespan (startup/shutdown), not at module level. Key detail: `FastAPIInstrumentor().instrument_app(app)` is called **inside** the lifespan, after `app` is created, but the `app` object itself is created at module level. `ElasticsearchInstrumentor().instrument()` is also called at startup.

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

Tests live in `demo/tests/test_api.py`. They use FastAPI's `TestClient` (synchronous) with the ES client mocked via `unittest.mock.AsyncMock`. The mock patches happen at `main.*` to intercept before the lifespan runs:

```python
with (
    patch("main.AsyncElasticsearch", return_value=mock_es),
    patch("main.FastAPIInstrumentor"),
    patch("main.ElasticsearchInstrumentor"),
    patch("main.trace"),
):
    import main
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

## Code Quality

All checks run from `demo/`:

```bash
uv run ruff check .        # lint
uv run ruff format --check .  # format
uv run pyright .           # type-check
uv run pytest              # tests
```

Pre-commit hooks at repo root cover ruff, ruff-format, pyright, and uv-lock. Always commit `demo/uv.lock` alongside `pyproject.toml` changes — the `uv-lock` hook will block the commit otherwise.

## Known Gotcha: loader.py except syntax

The `parse_json_field` function in `loader.py` had a Python 2-style `except A, B:` that ruff's pre-commit hook catches but `uv run ruff check` (run from within the venv) does not always flag as a syntax error in isolation. If this bug reappears, the fix is:

```python
# Wrong (Python 2 style — silent parse failure in some contexts)
except json.JSONDecodeError, TypeError:

# Correct
except (json.JSONDecodeError, TypeError):
```
