# elasticflix

A movie search app backed by Elasticsearch, built to generate realistic ES traffic for the `protospy` proxy. It exposes a browser UI (HTMX + custom CSS) and a JSON REST API from the same endpoints.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (for Elasticsearch)
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (Python package manager)
- Python 3.14+

## Setup

### 1. Start Elasticsearch

From the **repo root**:

```bash
docker compose up -d elasticsearch
```

This starts a single-node Elasticsearch 9.x instance on `http://localhost:9200` (no authentication).

### 2. Install dependencies

```bash
cd demo
uv sync
```

### 3. Load movie data

The demo application uses movie data from the [TMDB 5000 Movie Dataset](https://www.kaggle.com/datasets/tmdb/tmdb-movie-metadata) on Kaggle, in `demo/data/`. This will need to be loaded into Elasticsearch with:

```bash
uv run python loader.py
```

This creates the `movies` index (dropping it first if it exists) and bulk-indexes ~4800 movies. It prints progress every 500 documents and takes around 10–30 seconds depending on your machine.

### 4. Start the app

```bash
uv run uvicorn main:app --reload
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

## Endpoints

All endpoints return JSON by default. When called by HTMX (with the `HX-Request` header), they return an HTML fragment instead — the UI and the REST API share the same URLs.

| Endpoint | Description |
|---|---|
| `GET /` | Search UI shell |
| `GET /search?q=<term>&size=20` | Full-text search (title + overview) |
| `GET /item/<id>` | Movie detail by Elasticsearch document ID |
| `GET /suggest?q=<terms>` | Title autocomplete (multi-word, match_bool_prefix) |
| `GET /stats` | Genre counts and vote distribution |

FastAPI's auto-generated API docs are available at [http://localhost:8000/docs](http://localhost:8000/docs).

## Configuration

All settings can be overridden via environment variables:

| Variable | Default | Description |
|---|---|---|
| `ELASTICSEARCH_URL` | `http://localhost:9200` | Elasticsearch endpoint |
| `ELASTICSEARCH_INDEX` | `movies` | Index name |
| `OTLP_ENDPOINT` | _(none)_ | OTLP HTTP exporter endpoint; OTel traces are only exported when set |
| `SERVICE_NAME` | `elasticflix` | OTel service name |
| `DEBUG` | `false` | Log OTel spans to console |
| `HOST` | `0.0.0.0` | Uvicorn bind host |
| `PORT` | `8000` | Uvicorn bind port |

## Development

```bash
uv sync --extra dev   # install dev dependencies (includes pytest-playwright)

uv run pytest         # unit tests (fast, no server required)
uv run ruff check .   # lint
uv run ruff format .  # format
uv run pyright .      # type-check
```

### E2E tests (Playwright)

E2E tests run a real Chromium browser against a live server subprocess. They require Elasticsearch to be running and the movies index to be loaded (steps 1–3 of Setup above).

First-time setup — install the Chromium browser binary:

```bash
uv run playwright install chromium
```

Then run:

```bash
uv run pytest -m e2e -v
```

The test fixture starts `uvicorn` on a random free port automatically, so it won't conflict with a dev server already running on 8000.

### Pre-commit hooks

Ruff, ruff-format, pyright, and uv-lock hooks are configured in `.pre-commit-config.yaml` at the repo root. All Python hooks delegate to `uv run` so they use the versions pinned in `uv.lock`. To install:

```bash
pip install pre-commit
pre-commit install
```
