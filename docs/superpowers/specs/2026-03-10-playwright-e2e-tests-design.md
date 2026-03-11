# Design: Playwright E2E Tests for elasticflix

**Date:** 2026-03-10
**Status:** Approved

## Context

The `demo/` elasticflix app has good unit test coverage (ES mocked, API layer tested), but zero end-to-end coverage. The bugs fixed in this session — input outside the form preventing Enter submission, suggestion clicks not triggering search — were invisible to unit tests and only caught by manual browser testing. Playwright E2E tests fill that gap.

## Approach

Use `pytest-playwright` (Python Playwright binding) so everything stays in the existing `uv`/pytest toolchain. Tests start the FastAPI server as a subprocess fixture (ES assumed running and populated), run in a real browser, and are gated behind a `pytest -m e2e` marker so the unit test run is unaffected.

## File Layout

```
demo/
├── tests/
│   ├── conftest.py          # session-scoped server fixture + base_url override
│   └── test_e2e.py          # Playwright test scenarios
└── pyproject.toml           # add pytest-playwright to dev deps; register e2e marker
```

## Server Fixture (conftest.py)

Session-scoped fixture that:

1. Finds a free port by binding a socket to port 0, reads the assigned port, closes the socket
2. Spawns `uvicorn main:app --port <n>` as a subprocess (from `demo/`)
3. Polls `GET /` until it responds (up to ~5 seconds), then yields
4. Kills the subprocess on teardown

Overrides pytest-playwright's built-in `base_url` fixture to return `http://localhost:{free_port}` — individual tests never reference the port directly.

## Test Scenarios

All tests use known stable movies from the TMDB dataset.

| Test | Actions | Asserts |
|---|---|---|
| `test_search_via_enter` | Type "star wars", press Enter | Card titled "Star Wars" visible |
| `test_search_via_button` | Type "fistful", click Search button | Card "A Fistful of Dollars" visible |
| `test_autocomplete_shows` | Type "sta", wait 500ms | Suggestion "Star Wars" in dropdown |
| `test_autocomplete_click_fills_and_searches` | Click "Star Wars" suggestion | Input value = "Star Wars"; card visible |
| `test_movie_detail` | Search "star wars", click card | `#detail` contains "George Lucas" and "1977" |
| `test_stats_page` | Click Stats nav link | Genre table contains "Action"; histogram present |

## Dependencies

Add to `[project.optional-dependencies] dev`:
- `pytest-playwright>=0,<1`

Playwright browser binaries installed via `playwright install chromium`.

Add to `[tool.pytest.ini_options]`:
```toml
markers = ["e2e: end-to-end tests requiring a running Elasticsearch instance"]
```

## Running

```bash
# Unit tests only (default)
cd demo && uv run pytest

# E2E tests (requires docker-compose up + data loaded)
cd demo && uv run pytest -m e2e
```

## What This Catches

- Form/input structure issues (Enter key submission)
- HTMX trigger wiring (suggestions appearing, search firing)
- JS interaction handlers (suggestion click → fill + search)
- Template rendering (result cards, detail panel, stats fragments)
