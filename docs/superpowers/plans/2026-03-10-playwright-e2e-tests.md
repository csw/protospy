# Playwright E2E Tests Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Playwright E2E tests to `demo/` that catch browser-level interaction bugs (HTMX wiring, JS handlers, form submission) that the existing unit tests miss.

**Architecture:** `pytest-playwright` runs a real Chromium browser against a live FastAPI server subprocess. A session-scoped `conftest.py` fixture finds a free port, starts `uvicorn` as a subprocess, polls until ready, and overrides pytest-playwright's `base_url` fixture so individual tests use relative paths. ES must be running and populated (via `docker-compose up` + `loader.py`).

**Tech Stack:** pytest-playwright, Playwright (Chromium), pytest, Python 3.14, uv

---

## Chunk 1: Dependencies and pytest configuration

### Task 1: Add pytest-playwright to pyproject.toml and configure pytest markers

**Files:**
- Modify: `demo/pyproject.toml`

- [ ] **Step 1: Add `pytest-playwright` to dev optional dependencies and add `[tool.pytest.ini_options]`**

Edit `demo/pyproject.toml` so it reads:

```toml
[project]
name = "elasticflix"
version = "0.1.0"
description = "Show movies from Elasticsearch"
readme = "README.md"
requires-python = ">=3.14"
dependencies = [
    "fastapi>=0,<1",
    "uvicorn[standard]>=0,<1",
    "elasticsearch[async]>=9,<10",
    "pydantic-settings>=2,<3",
    "jinja2>=3,<4",
    "python-multipart>=0,<1",
    "opentelemetry-sdk>=1,<2",
    "opentelemetry-api>=1,<2",
    "opentelemetry-instrumentation-fastapi>=0,<1",
    "opentelemetry-instrumentation-elasticsearch>=0,<1",
    "opentelemetry-exporter-otlp-proto-http>=1,<2",
]

[project.optional-dependencies]
dev = [
    "pytest>=9,<10",
    "pytest-asyncio>=1,<2",
    "pytest-playwright>=0,<1",
    "httpx>=0,<1",
    "ruff>=0,<1",
    "pyright>=1,<2",
]

[dependency-groups]
dev = [
    "pyright>=1,<2",
    "ruff>=0,<1",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
markers = [
    "e2e: end-to-end tests (require running Elasticsearch and loaded index)",
]
```

- [ ] **Step 2: Sync dependencies and update lockfile**

```bash
cd demo
uv sync --extra dev
```

Expected: lockfile updated, `pytest-playwright` and `playwright` installed.

- [ ] **Step 3: Install Playwright's Chromium browser binary**

```bash
cd demo
uv run playwright install chromium
```

Expected: Chromium downloaded to Playwright's browser cache.

- [ ] **Step 4: Verify pytest-playwright is importable**

```bash
cd demo
uv run python -c "import pytest_playwright; print('ok')"
```

Expected: `ok`

- [ ] **Step 5: Commit**

```bash
cd demo
git add pyproject.toml uv.lock
git commit -m "feat(demo): add pytest-playwright to dev dependencies"
```

---

## Chunk 2: Server fixture

### Task 2: Create `conftest.py` with dynamic-port server fixture

**Files:**
- Create: `demo/tests/conftest.py`

- [ ] **Step 1: Write a failing placeholder test to confirm the marker and fixture wiring**

Create `demo/tests/test_e2e.py` with just one test for now:

```python
import pytest
from playwright.sync_api import Page


@pytest.mark.e2e
def test_homepage_loads(page: Page) -> None:
    page.goto("/")
    assert page.title() == "ElasticFlix"
```

- [ ] **Step 2: Run to confirm it fails (no server fixture yet)**

```bash
cd demo
uv run pytest -m e2e -v 2>&1 | head -30
```

Expected: test is collected but fails — either `ConnectionRefusedError` or `base_url` is empty so `page.goto("/")` resolves to `about:blank`.

- [ ] **Step 3: Create `demo/tests/conftest.py`**

```python
import socket
import subprocess
import time
import urllib.request
from pathlib import Path

import pytest

_DEMO_DIR = Path(__file__).parent.parent


def _free_port() -> int:
    """Ask the OS for an unused port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def live_server_url() -> str:  # type: ignore[return]
    port = _free_port()
    url = f"http://127.0.0.1:{port}"
    proc = subprocess.Popen(
        [
            "uv",
            "run",
            "uvicorn",
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=_DEMO_DIR,
    )
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1)  # noqa: S310
            break
        except Exception:
            time.sleep(0.1)
    else:
        proc.kill()
        raise RuntimeError(f"Server did not start at {url}")
    yield url  # type: ignore[misc]
    proc.kill()
    proc.wait(timeout=5)


@pytest.fixture(scope="session")
def base_url(live_server_url: str) -> str:
    """Override pytest-playwright's base_url with the dynamic server URL."""
    return live_server_url
```

- [ ] **Step 4: Run the placeholder test — should now pass**

```bash
cd demo
uv run pytest -m e2e -v
```

Expected:
```
PASSED tests/test_e2e.py::test_homepage_loads
```

- [ ] **Step 5: Run unit tests to confirm nothing is broken**

```bash
cd demo
uv run pytest -m "not e2e" -v
```

Expected: all 7 existing tests pass, server subprocess is NOT started.

- [ ] **Step 6: Commit**

```bash
cd demo
git add tests/conftest.py tests/test_e2e.py
git commit -m "feat(demo): add session-scoped uvicorn fixture for E2E tests"
```

---

## Chunk 3: E2E test scenarios

### Task 3: Write all E2E test scenarios

**Files:**
- Modify: `demo/tests/test_e2e.py`

Replace the entire file with the full test suite. Key notes:
- Use `page.locator("#search-input").type("text")` (not `fill()`) for tests that need HTMX's `keyup` trigger to fire — `type()` dispatches real key events character by character; `fill()` does not.
- `expect(locator).to_be_visible()` has a built-in retry timeout (default 5s) — no manual `wait_for_selector` needed.
- All assertions use well-known TMDB movies: Star Wars (id 11), A Fistful of Dollars (id 391) — both reliably in the dataset.

- [ ] **Step 1: Replace `test_e2e.py` with the full test suite**

```python
import pytest
from playwright.sync_api import Page, expect


@pytest.mark.e2e
def test_homepage_loads(page: Page) -> None:
    page.goto("/")
    assert page.title() == "ElasticFlix"


@pytest.mark.e2e
def test_search_via_enter(page: Page) -> None:
    """Typing in the search box and pressing Enter returns results."""
    page.goto("/")
    page.locator("#search-input").fill("star wars")
    page.keyboard.press("Enter")
    expect(page.locator(".movie-card").filter(has_text="Star Wars")).to_be_visible()


@pytest.mark.e2e
def test_search_via_button(page: Page) -> None:
    """Clicking the Search button returns results."""
    page.goto("/")
    page.locator("#search-input").fill("fistful")
    page.locator("button[type='submit']").click()
    expect(
        page.locator(".movie-card").filter(has_text="A Fistful of Dollars")
    ).to_be_visible()


@pytest.mark.e2e
def test_autocomplete_shows(page: Page) -> None:
    """Typing triggers the suggestion dropdown via HTMX keyup."""
    page.goto("/")
    # type() fires real keyup events, which HTMX's keyup trigger requires
    page.locator("#search-input").type("sta")
    expect(
        page.locator("#suggestions-list li").filter(has_text="Star Wars")
    ).to_be_visible()


@pytest.mark.e2e
def test_autocomplete_click_fills_and_searches(page: Page) -> None:
    """Clicking a suggestion fills the input and triggers a search."""
    page.goto("/")
    page.locator("#search-input").type("sta")
    expect(
        page.locator("#suggestions-list li").filter(has_text="Star Wars")
    ).to_be_visible()
    page.locator("#suggestions-list li").filter(has_text="Star Wars").click()
    expect(page.locator("#search-input")).to_have_value("Star Wars")
    expect(page.locator(".movie-card").filter(has_text="Star Wars")).to_be_visible()


@pytest.mark.e2e
def test_movie_detail(page: Page) -> None:
    """Clicking a movie card loads the detail panel."""
    page.goto("/")
    page.locator("#search-input").fill("star wars")
    page.keyboard.press("Enter")
    expect(page.locator(".movie-card").filter(has_text="Star Wars")).to_be_visible()
    page.locator(".movie-card").filter(has_text="Star Wars").click()
    expect(page.locator("#detail")).to_contain_text("George Lucas")
    expect(page.locator("#detail")).to_contain_text("1977")


@pytest.mark.e2e
def test_stats_page(page: Page) -> None:
    """Clicking Stats loads genre and histogram data into #results."""
    page.goto("/")
    page.locator("nav a", has_text="Stats").click()
    expect(page.locator("#results")).to_contain_text("Action")
    expect(page.locator("#results")).to_contain_text("Adventure")
```

- [ ] **Step 2: Run the full E2E suite**

```bash
cd demo
uv run pytest -m e2e -v
```

Expected: all 7 tests pass. If any fail, diagnose:
- `test_autocomplete_*` fail → check `type()` fires keyup (it should); verify `/suggest` returns "Star Wars" for prefix "sta" via `curl localhost:8000/suggest?q=sta`
- `test_movie_detail` fails on "George Lucas" → check `/item/11` returns the right director field
- `test_stats_page` fails → check `/stats` returns genre buckets with "Action"

- [ ] **Step 3: Run full test suite (unit + E2E) to confirm nothing regressed**

```bash
cd demo
uv run pytest -v
```

Expected: 7 unit tests pass; E2E tests are deselected (not run) because they don't match the default marker filter.

```bash
cd demo
uv run pytest -m e2e -v
```

Expected: 7 E2E tests pass.

- [ ] **Step 4: Run all code quality checks**

```bash
cd demo
uv run ruff check .
uv run ruff format --check .
uv run pyright .
```

Expected: no errors. If ruff flags the `# noqa: S310` comment (urllib urlopen), that suppression is intentional — the URL is always `127.0.0.1` (not user-supplied).

- [ ] **Step 5: Commit**

```bash
cd demo
git add tests/test_e2e.py tests/conftest.py
git commit -m "feat(demo): add Playwright E2E tests for search, autocomplete, and stats"
```

---

## Running the tests

```bash
# Unit tests only (fast, no server needed):
cd demo && uv run pytest

# E2E tests (requires docker-compose up + loader.py run):
cd demo && uv run pytest -m e2e -v

# Everything:
cd demo && uv run pytest && uv run pytest -m e2e
```
