# Conformance PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a proof-of-concept HTTP reverse proxy conformance test suite to validate the testing architecture before developing the full suite.

**Architecture:** pytest test suite with three actors per test: an httpx (or h11) client, a proxy under test (Caddy for the PoC), and an in-process aiohttp echo server as target. Tests are parametrized with dataclasses carrying RFC references. The proxy is pluggable via CLI option.

**Tech Stack:** Python 3.14+, uv, pytest, aiohttp, httpx, h11, Caddy

---

## Background

Protospy is a Rust HTTP 1.1 reverse proxy. It needs an end-to-end conformance test suite to validate proxy behavior against RFCs 9110, 9111, and 9112. Before building the full suite, this PoC validates the testing architecture by answering four questions:

1. **Echo server pattern**: Does an in-process aiohttp echo server with out-of-band request capture provide sufficient observability into proxy behavior — including for methods like HEAD where the response body can't carry echo data?
2. **h11 client integration**: Does an h11-based low-level client integrate cleanly into pytest for protocol edge-case testing (e.g., sending a chunked request with a missing final chunk)?
3. **Proxy swapping**: Can the proxy under test be changed via a CLI option without modifying tests?
4. **Test data structure**: Is the dataclass-based test case format (with RFC references) expressive enough for the full suite?

## File Structure

```
conformance/
├── pyproject.toml
├── src/
│   └── proxy_conformance/
│       ├── __init__.py
│       ├── types.py            # Test case dataclasses + assertion helpers
│       ├── echo_server.py      # aiohttp echo target server
│       └── h11_client.py       # Low-level h11 client helper
└── tests/
    ├── conftest.py             # Fixtures: echo server, proxy lifecycle, CLI options
    ├── test_echo_server.py     # Validate echo server in isolation
    ├── test_basic_proxy.py     # Happy-path parametrized proxy tests
    └── test_chunked_errors.py  # Malformed chunked encoding via h11
```

Follows the same `src/` layout as the existing `demo/` project.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `conformance/pyproject.toml`
- Create: `conformance/src/proxy_conformance/__init__.py`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p conformance/src/proxy_conformance conformance/tests
```

- [ ] **Step 2: Write pyproject.toml**

Create `conformance/pyproject.toml`:

```toml
[project]
name = "proxy-conformance"
version = "0.1.0"
description = "HTTP reverse proxy conformance test suite"
requires-python = ">=3.14"
dependencies = [
    "aiohttp>=3,<4",
    "h11>=0,<1",
    "httpx>=0,<1",
    "pytest>=9,<10",
]

[dependency-groups]
dev = [
    "pyright>=1,<2",
    "ruff>=0,<1",
]

[build-system]
requires = ["uv_build>=0.6.6,<1"]
build-backend = "uv_build"

[tool.uv.build-backend]
module-root = "src"

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.pyright]
pythonVersion = "3.14"

[tool.ruff.lint]
select = ["E", "F", "I", "UP"]
```

Note: All dependencies are test infrastructure — there is no separate "runtime" vs "dev" split because this project exists solely to run tests. Ruff and pyright are in the dev dependency group for consistency with the demo project.

- [ ] **Step 3: Create `__init__.py`**

Create `conformance/src/proxy_conformance/__init__.py` as an empty file.

- [ ] **Step 4: Verify uv setup**

```bash
cd conformance && uv sync
```

Expected: lockfile generated, dependencies installed, no errors.

- [ ] **Step 5: Commit**

```bash
git add conformance/pyproject.toml conformance/uv.lock conformance/src/proxy_conformance/__init__.py
git commit -m "build(conformance): scaffold PoC project with dependencies"
```

---

### Task 2: Types and Assertion Helpers

**Files:**
- Create: `conformance/src/proxy_conformance/types.py`

These dataclasses define the test case format. Every proxy test case specifies what to send, what the target server should see, and what the client should receive, with an RFC reference.

- [ ] **Step 1: Write types.py**

Create `conformance/src/proxy_conformance/types.py`:

```python
"""Test case dataclasses and assertion helpers for proxy conformance tests."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class RequestSpec:
    """What the test client sends to the proxy."""

    method: str = "GET"
    path: str = "/"
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes | None = None


@dataclass
class HeaderExpectation:
    """Assertions about HTTP headers.

    - present: header must exist with this exact value (case-insensitive name)
    - contains: header must exist and its value must contain this substring
    - absent: header must not exist
    """

    present: dict[str, str] = field(default_factory=dict)
    contains: dict[str, str] = field(default_factory=dict)
    absent: list[str] = field(default_factory=list)


@dataclass
class TargetExpectation:
    """What the target server should observe in the forwarded request."""

    headers: HeaderExpectation = field(default_factory=HeaderExpectation)
    body: bytes | None = None  # None = don't check


@dataclass
class ClientExpectation:
    """What the test client should observe in the proxy's response."""

    status: int = 200
    headers: HeaderExpectation = field(default_factory=HeaderExpectation)


@dataclass
class ProxyTestCase:
    """A single proxy conformance test case."""

    id: str
    rfc_ref: str
    description: str
    request: RequestSpec
    expect_at_target: TargetExpectation = field(default_factory=TargetExpectation)
    expect_at_client: ClientExpectation = field(default_factory=ClientExpectation)


def assert_headers(
    actual: dict[str, list[str]],
    expected: HeaderExpectation,
    context: str = "",
) -> None:
    """Assert that actual headers satisfy the expectation.

    Args:
        actual: Headers as {lowercase_name: [values...]}.
        expected: The header expectation to check against.
        context: Label for assertion messages (e.g., "target" or "client").
    """
    prefix = f"[{context}] " if context else ""

    for name, value in expected.present.items():
        key = name.lower()
        assert key in actual, f"{prefix}Expected header {name!r} to be present"
        actual_values = actual[key]
        assert value in actual_values, (
            f"{prefix}Header {name!r}: expected {value!r} "
            f"to be among {actual_values!r}"
        )

    for name, substring in expected.contains.items():
        key = name.lower()
        assert key in actual, f"{prefix}Expected header {name!r} to be present"
        joined = ", ".join(actual[key])
        assert substring in joined, (
            f"{prefix}Header {name!r}: expected substring {substring!r} "
            f"in {joined!r}"
        )

    for name in expected.absent:
        assert name.lower() not in actual, (
            f"{prefix}Header {name!r} should be absent but was found"
        )


def normalize_httpx_headers(headers: object) -> dict[str, list[str]]:
    """Convert httpx.Headers to the dict[str, list[str]] format.

    Accepts anything with a multi_items() method (httpx.Headers)
    or a regular dict.
    """
    result: dict[str, list[str]] = {}
    if hasattr(headers, "multi_items"):
        for name, value in headers.multi_items():  # type: ignore[union-attr]
            result.setdefault(name.lower(), []).append(value)
    elif isinstance(headers, dict):
        for name, value in headers.items():
            key = name.lower()
            if isinstance(value, list):
                result[key] = value
            else:
                result.setdefault(key, []).append(value)
    return result
```

- [ ] **Step 2: Verify types are importable**

```bash
cd conformance && uv run python -c "from proxy_conformance.types import ProxyTestCase; print('OK')"
```

Expected: prints `OK`.

- [ ] **Step 3: Run lints**

```bash
cd conformance && uv run ruff check . && uv run pyright .
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add conformance/src/proxy_conformance/types.py
git commit -m "feat(conformance): add test case dataclasses and assertion helpers"
```

---

### Task 3: Echo Server

**Files:**
- Create: `conformance/src/proxy_conformance/echo_server.py`
- Create: `conformance/tests/test_echo_server.py`

The echo server is the target (upstream) server in the test architecture. It runs in a background thread, accepts any HTTP request, and:

1. **Always**: stores the full request details (method, path, headers, body) in a thread-safe queue for out-of-band retrieval by the test.
2. **For methods with response bodies** (everything except HEAD): also returns the request details as JSON in the response body.
3. **For HEAD**: returns a 200 with `Content-Type: application/json` but an empty body. The test must use out-of-band capture.

Design rationale: The out-of-band queue is the **primary** capture mechanism. The JSON echo body is a convenience for debugging and for simple tests that don't need to examine request details separately.

- [ ] **Step 1: Write echo_server.py**

Create `conformance/src/proxy_conformance/echo_server.py`:

```python
"""In-process aiohttp echo server for proxy conformance testing.

Accepts any HTTP request, captures it for out-of-band retrieval,
and echoes request details as JSON in the response body (except HEAD).
"""

from __future__ import annotations

import asyncio
import base64
import queue
import socket
import threading
from dataclasses import dataclass, field

from aiohttp import web


@dataclass
class CapturedRequest:
    """A request as observed by the echo server."""

    method: str
    path: str
    headers: dict[str, list[str]]
    body: bytes

    def header_values(self, name: str) -> list[str]:
        """Get all values for a header name (case-insensitive)."""
        return self.headers.get(name.lower(), [])

    def header_joined(self, name: str) -> str | None:
        """Get a header's values joined with ', ' (case-insensitive)."""
        values = self.header_values(name)
        return ", ".join(values) if values else None


def _find_free_port() -> int:
    """Find an available TCP port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@dataclass
class EchoServer:
    """An HTTP echo server that runs in a background thread.

    Usage:
        server = EchoServer()
        server.start()
        # ... make requests to server.url ...
        captured = server.last_request()
        server.stop()
    """

    host: str = "127.0.0.1"
    port: int = field(default_factory=_find_free_port)
    requests: queue.Queue[CapturedRequest] = field(
        default_factory=queue.Queue,
    )
    _thread: threading.Thread | None = field(default=None, repr=False)
    _loop: asyncio.AbstractEventLoop | None = field(default=None, repr=False)
    _runner: web.AppRunner | None = field(default=None, repr=False)

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}"

    def start(self) -> None:
        """Start the server in a background thread. Blocks until ready."""
        started = threading.Event()
        self._thread = threading.Thread(
            target=self._run,
            args=(started,),
            daemon=True,
        )
        self._thread.start()
        if not started.wait(timeout=5):
            raise RuntimeError("Echo server failed to start within 5 seconds")

    def stop(self) -> None:
        """Stop the server and wait for the background thread to exit."""
        if self._loop and self._runner:
            future = asyncio.run_coroutine_threadsafe(
                self._shutdown(),
                self._loop,
            )
            future.result(timeout=5)
        if self._thread:
            self._thread.join(timeout=5)

    def last_request(self, timeout: float = 2.0) -> CapturedRequest:
        """Retrieve the next captured request. Blocks until available.

        Raises queue.Empty if no request arrives within the timeout.
        """
        return self.requests.get(timeout=timeout)

    def clear(self) -> None:
        """Drain any uncollected requests from the queue."""
        while True:
            try:
                self.requests.get_nowait()
            except queue.Empty:
                break

    def _run(self, started: threading.Event) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self._start_app(started))
        self._loop.run_forever()

    async def _start_app(self, started: threading.Event) -> None:
        app = web.Application()
        app.router.add_route("*", "/{path_info:.*}", self._handle)
        self._runner = web.AppRunner(app)
        await self._runner.setup()
        site = web.TCPSite(self._runner, self.host, self.port)
        await site.start()
        started.set()

    async def _shutdown(self) -> None:
        if self._runner:
            await self._runner.cleanup()
        if self._loop:
            self._loop.stop()

    async def _handle(self, request: web.Request) -> web.Response:
        body = await request.read()

        # Build headers dict preserving multiple values per name.
        headers: dict[str, list[str]] = {}
        for name, value in request.headers.items():
            headers.setdefault(name.lower(), []).append(value)

        captured = CapturedRequest(
            method=request.method,
            path=request.path_qs,
            headers=headers,
            body=body,
        )
        self.requests.put(captured)

        if request.method == "HEAD":
            return web.Response(status=200, content_type="application/json")

        echo_data = {
            "method": captured.method,
            "path": captured.path,
            "headers": captured.headers,
            "body_base64": base64.b64encode(body).decode() if body else None,
        }
        return web.json_response(echo_data)
```

- [ ] **Step 2: Write echo server tests**

Create `conformance/tests/test_echo_server.py`:

```python
"""Validate the echo server in isolation (no proxy)."""

import queue

import httpx
import pytest

from proxy_conformance.echo_server import EchoServer


@pytest.fixture()
def server():
    srv = EchoServer()
    srv.start()
    yield srv
    srv.stop()


class TestEchoBody:
    """Echo server returns request details as JSON in the response body."""

    def test_get(self, server: EchoServer) -> None:
        resp = httpx.get(
            f"{server.url}/test-path",
            headers={"X-Custom": "hello"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["method"] == "GET"
        assert data["path"] == "/test-path"
        assert "hello" in data["headers"]["x-custom"]

    def test_post_body(self, server: EchoServer) -> None:
        resp = httpx.post(
            f"{server.url}/submit",
            content=b'{"key": "value"}',
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["method"] == "POST"
        # Body is base64-encoded in echo response.
        import base64

        assert base64.b64decode(data["body_base64"]) == b'{"key": "value"}'

    def test_query_string_preserved(self, server: EchoServer) -> None:
        resp = httpx.get(f"{server.url}/search?q=test&page=2")
        data = resp.json()
        assert data["path"] == "/search?q=test&page=2"


class TestOutOfBand:
    """Out-of-band capture works for all methods including HEAD."""

    def test_head_no_body(self, server: EchoServer) -> None:
        resp = httpx.head(f"{server.url}/head-test")
        assert resp.status_code == 200
        assert resp.content == b""
        # Must use out-of-band capture for HEAD.
        captured = server.last_request()
        assert captured.method == "HEAD"
        assert captured.path == "/head-test"

    def test_get_captured(self, server: EchoServer) -> None:
        httpx.get(
            f"{server.url}/oob",
            headers={"X-Trace": "abc123"},
        )
        captured = server.last_request()
        assert captured.method == "GET"
        assert captured.path == "/oob"
        assert captured.header_values("x-trace") == ["abc123"]

    def test_post_body_captured(self, server: EchoServer) -> None:
        httpx.post(f"{server.url}/data", content=b"raw bytes")
        captured = server.last_request()
        assert captured.body == b"raw bytes"

    def test_multiple_requests_queued(self, server: EchoServer) -> None:
        httpx.get(f"{server.url}/first")
        httpx.get(f"{server.url}/second")
        first = server.last_request()
        second = server.last_request()
        assert first.path == "/first"
        assert second.path == "/second"

    def test_empty_queue_times_out(self, server: EchoServer) -> None:
        with pytest.raises(queue.Empty):
            server.last_request(timeout=0.1)
```

- [ ] **Step 3: Run echo server tests**

```bash
cd conformance && uv run pytest tests/test_echo_server.py -v
```

Expected: all tests pass. Debug any failures before proceeding.

- [ ] **Step 4: Run lints**

```bash
cd conformance && uv run ruff check . && uv run ruff format --check . && uv run pyright .
```

Fix any issues.

- [ ] **Step 5: Commit**

```bash
git add conformance/src/proxy_conformance/echo_server.py conformance/tests/test_echo_server.py
git commit -m "feat(conformance): add echo server with out-of-band request capture"
```

---

### Task 4: Proxy Fixture and Configuration

**Files:**
- Create: `conformance/tests/conftest.py`

This sets up the test infrastructure that all proxy tests share:
- A session-scoped echo server
- A session-scoped Caddy reverse proxy (started as a subprocess)
- A `--proxy` CLI option for future proxy swapping
- An autouse fixture that clears the echo server's request queue between tests

The Caddy proxy is configured via a temporary Caddyfile that reverse-proxies to the echo server. Caddy's admin API is disabled to avoid port conflicts.

- [ ] **Step 1: Write conftest.py**

Create `conformance/tests/conftest.py`:

```python
"""Shared fixtures for proxy conformance tests."""

from __future__ import annotations

import socket
import subprocess
import tempfile
import time
from pathlib import Path

import pytest

from proxy_conformance.echo_server import EchoServer


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--proxy",
        default="caddy",
        help="Proxy under test (default: caddy)",
    )


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_for_port(
    port: int,
    host: str = "127.0.0.1",
    timeout: float = 5.0,
) -> None:
    """Block until a TCP connection to host:port succeeds."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.1):
                return
        except OSError:
            time.sleep(0.05)
    msg = f"Port {port} not available after {timeout}s"
    raise TimeoutError(msg)


def _start_caddy(echo_url: str, proxy_port: int) -> subprocess.Popen[bytes]:
    """Start a Caddy reverse proxy subprocess.

    Returns the Popen handle. The caller is responsible for terminating it.
    """
    caddyfile_content = """\
{{
    admin off
}}

:{proxy_port} {{
    reverse_proxy {echo_url}
}}
""".format(proxy_port=proxy_port, echo_url=echo_url)

    # Write Caddyfile to a temp file that persists for the session.
    tmp = tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".caddyfile",
        delete=False,
    )
    tmp.write(caddyfile_content)
    tmp.flush()

    proc = subprocess.Popen(
        ["caddy", "run", "--config", tmp.name, "--adapter", "caddyfile"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        _wait_for_port(proxy_port)
    except TimeoutError:
        proc.terminate()
        proc.wait(timeout=5)
        stderr = proc.stderr.read() if proc.stderr else b""
        msg = f"Caddy failed to start: {stderr.decode(errors='replace')}"
        raise RuntimeError(msg) from None

    return proc


@pytest.fixture(scope="session")
def echo_server() -> EchoServer:
    server = EchoServer()
    server.start()
    yield server  # type: ignore[misc]
    server.stop()


@pytest.fixture(scope="session")
def proxy_url(request: pytest.FixtureRequest, echo_server: EchoServer) -> str:
    """URL of the proxy under test. Proxy choice is set by --proxy."""
    proxy_type = request.config.getoption("--proxy")

    if proxy_type == "caddy":
        port = _find_free_port()
        proc = _start_caddy(echo_server.url, port)
        yield f"http://127.0.0.1:{port}"  # type: ignore[misc]
        proc.terminate()
        proc.wait(timeout=5)
    else:
        msg = (
            f"Unknown proxy type: {proxy_type!r}. "
            "Supported: caddy. "
            "To add a new proxy, extend the proxy_url fixture in conftest.py."
        )
        raise ValueError(msg)


@pytest.fixture(autouse=True)
def _clear_echo_requests(echo_server: EchoServer) -> None:
    """Drain any leftover requests between tests."""
    echo_server.clear()
```

- [ ] **Step 2: Verify Caddy starts and stops**

Write a trivial smoke test directly in the terminal (don't commit this):

```bash
cd conformance && uv run pytest --co -q
```

Expected: test collection succeeds (conftest.py loads without import errors). If `caddy` is not in PATH, this is where it would fail.

- [ ] **Step 3: Run lints**

```bash
cd conformance && uv run ruff check . && uv run ruff format --check . && uv run pyright .
```

Fix any issues.

- [ ] **Step 4: Commit**

```bash
git add conformance/tests/conftest.py
git commit -m "feat(conformance): add proxy fixture with Caddy lifecycle management"
```

---

### Task 5: Happy-Path Proxy Tests

**Files:**
- Create: `conformance/tests/test_basic_proxy.py`

These tests validate basic reverse proxy behavior using httpx as the client. Each test case is a `ProxyTestCase` dataclass with an RFC reference. Tests are parametrized so adding new cases requires no new test code.

The test function sends the specified request through the proxy, then asserts on both the client-received response and the target-observed request (via out-of-band capture).

- [ ] **Step 1: Write test_basic_proxy.py**

Create `conformance/tests/test_basic_proxy.py`:

```python
"""Happy-path proxy conformance tests.

Each test case validates a specific RFC requirement using:
- httpx as the client
- The proxy under test (selected by --proxy)
- The echo server as the target (with out-of-band request capture)
"""

import httpx
import pytest

from proxy_conformance.echo_server import EchoServer
from proxy_conformance.types import (
    ClientExpectation,
    HeaderExpectation,
    ProxyTestCase,
    RequestSpec,
    TargetExpectation,
    assert_headers,
    normalize_httpx_headers,
)

BASIC_PROXY_TESTS = [
    ProxyTestCase(
        id="get-simple",
        rfc_ref="RFC 9110 §9.3.1",
        description="Proxy forwards a simple GET and returns the response",
        request=RequestSpec(method="GET", path="/hello"),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="via-header-added",
        rfc_ref="RFC 9110 §7.6.3",
        description=(
            "Proxy appends a Via header indicating the protocol version "
            "and proxy identity"
        ),
        request=RequestSpec(method="GET", path="/via-test"),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                contains={"via": "1.1"},
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="hop-by-hop-removal",
        rfc_ref="RFC 9110 §7.6.1",
        description=(
            "Proxy removes hop-by-hop headers (Connection, Keep-Alive) "
            "from the forwarded request"
        ),
        request=RequestSpec(
            method="GET",
            path="/hop-test",
            headers={"Connection": "keep-alive", "Keep-Alive": "timeout=5"},
        ),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                absent=["keep-alive"],
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="post-body-forwarded",
        rfc_ref="RFC 9110 §9.3.3",
        description="Proxy forwards POST request body to the target intact",
        request=RequestSpec(
            method="POST",
            path="/body-test",
            headers={"Content-Type": "application/json"},
            body=b'{"key": "value"}',
        ),
        expect_at_target=TargetExpectation(
            body=b'{"key": "value"}',
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="head-request",
        rfc_ref="RFC 9110 §9.3.2",
        description=(
            "Proxy forwards HEAD; response has no body; "
            "out-of-band capture records the request"
        ),
        request=RequestSpec(method="HEAD", path="/head-test"),
        expect_at_client=ClientExpectation(status=200),
    ),
]


@pytest.mark.parametrize(
    "case",
    BASIC_PROXY_TESTS,
    ids=lambda c: c.id,
)
def test_basic_proxy(
    proxy_url: str,
    echo_server: EchoServer,
    case: ProxyTestCase,
) -> None:
    # --- Send request through the proxy ---
    response = httpx.request(
        case.request.method,
        f"{proxy_url}{case.request.path}",
        headers=case.request.headers,
        content=case.request.body,
    )

    # --- Client-side assertions ---
    assert response.status_code == case.expect_at_client.status, (
        f"[{case.id}] Expected status {case.expect_at_client.status}, "
        f"got {response.status_code}"
    )
    client_headers = normalize_httpx_headers(response.headers)
    assert_headers(client_headers, case.expect_at_client.headers, context="client")

    # --- Target-side assertions (out-of-band) ---
    captured = echo_server.last_request()
    assert_headers(captured.headers, case.expect_at_target.headers, context="target")

    if case.expect_at_target.body is not None:
        assert captured.body == case.expect_at_target.body, (
            f"[{case.id}] Target body mismatch: "
            f"expected {case.expect_at_target.body!r}, got {captured.body!r}"
        )
```

- [ ] **Step 2: Run the proxy tests**

```bash
cd conformance && uv run pytest tests/test_basic_proxy.py -v
```

Expected: all 5 tests pass. Caddy starts, proxies requests to the echo server, and shuts down cleanly.

Possible issues to investigate:
- **Via test fails**: Caddy might not add a Via header by default. If so, this is a valid finding — document it and adjust the test expectation or Caddy config.
- **Hop-by-hop test fails**: Caddy may forward or strip different headers than expected. Document the actual behavior.
- **Timeout on `last_request()`**: The proxy didn't forward the request. Check Caddy stderr for errors.

These "failures" are valuable PoC findings — they tell us where the test expectations or proxy config need adjustment.

- [ ] **Step 3: Run lints**

```bash
cd conformance && uv run ruff check . && uv run ruff format --check . && uv run pyright .
```

- [ ] **Step 4: Commit**

```bash
git add conformance/tests/test_basic_proxy.py
git commit -m "feat(conformance): add happy-path parametrized proxy tests"
```

---

### Task 6: h11 Client and Protocol Error Test

**Files:**
- Create: `conformance/src/proxy_conformance/h11_client.py`
- Create: `conformance/tests/test_chunked_errors.py`

This task demonstrates the low-level h11 client pattern for protocol edge cases. The test sends a chunked POST request that deliberately omits the final zero-length chunk, then observes how the proxy handles it.

The h11 library constructs the HTTP request (including proper chunk framing), but we deliberately skip the `EndOfMessage` event. Raw socket operations handle the connection close and response reading.

- [ ] **Step 1: Write h11_client.py**

Create `conformance/src/proxy_conformance/h11_client.py`:

```python
"""Low-level HTTP client using h11 for protocol edge-case testing.

h11 is used to construct well-formed HTTP framing up to the point where
we deliberately introduce a protocol violation. Response parsing uses
manual HTTP/1.1 parsing because h11's state machine won't read a
response while it thinks the request body is still in progress.
"""

from __future__ import annotations

import socket
from dataclasses import dataclass

import h11


@dataclass
class RawResponse:
    """A minimally-parsed HTTP response."""

    status: int
    headers: dict[str, str]
    body: bytes


def send_incomplete_chunked_request(
    host: str,
    port: int,
    path: str = "/",
    chunk_data: bytes = b"partial data",
    timeout: float = 5.0,
) -> RawResponse | None:
    """Send a chunked POST that omits the final zero-length chunk.

    Uses h11 to construct proper HTTP framing for the request line,
    headers, and one data chunk. Then closes the write side of the
    socket WITHOUT sending the terminating empty chunk.

    Returns the proxy's response, or None if the connection was closed
    with no response.
    """
    conn = h11.Connection(h11.CLIENT)

    sock = socket.create_connection((host, port), timeout=timeout)
    try:
        # Send request headers. h11 handles the request line and
        # header formatting.
        request = h11.Request(
            method="POST",
            target=path,
            headers=[
                ("Host", f"{host}:{port}"),
                ("Transfer-Encoding", "chunked"),
            ],
        )
        sock.sendall(conn.send(request))

        # Send one properly-framed chunk. h11 produces the chunk
        # length prefix and trailing CRLF.
        sock.sendall(conn.send(h11.Data(data=chunk_data)))

        # DELIBERATE PROTOCOL VIOLATION: do NOT send
        # conn.send(h11.EndOfMessage()), which would produce the
        # final "0\r\n\r\n" chunk. Instead, close the write side.
        sock.shutdown(socket.SHUT_WR)

        # Read whatever the proxy sends back.
        response_bytes = b""
        while True:
            data = sock.recv(4096)
            if not data:
                break
            response_bytes += data
    finally:
        sock.close()

    if not response_bytes:
        return None

    return _parse_raw_response(response_bytes)


def _parse_raw_response(data: bytes) -> RawResponse:
    """Parse a raw HTTP/1.1 response into status, headers, and body.

    This is intentionally minimal — just enough to extract the status
    code and headers for assertion purposes.
    """
    header_end = data.find(b"\r\n\r\n")
    if header_end == -1:
        msg = f"No header terminator found in response: {data[:200]!r}"
        raise ValueError(msg)

    header_section = data[:header_end].decode("latin-1")
    body = data[header_end + 4 :]

    lines = header_section.split("\r\n")
    status_line = lines[0]
    # e.g. "HTTP/1.1 400 Bad Request"
    parts = status_line.split(" ", 2)
    status = int(parts[1])

    headers: dict[str, str] = {}
    for line in lines[1:]:
        name, _, value = line.partition(": ")
        headers[name.lower()] = value

    return RawResponse(status=status, headers=headers, body=body)
```

- [ ] **Step 2: Write the protocol error test**

Create `conformance/tests/test_chunked_errors.py`:

```python
"""Protocol edge-case tests using the h11 low-level client.

These tests deliberately send malformed HTTP to observe proxy error
handling behavior.
"""

from __future__ import annotations

import queue
import urllib.parse

import pytest

from proxy_conformance.echo_server import EchoServer
from proxy_conformance.h11_client import send_incomplete_chunked_request


class TestIncompleteChunkedRequest:
    """Proxy handling of a chunked request with a missing final chunk.

    RFC 9112 §7.1 defines chunked transfer coding. A chunked body is
    terminated by a zero-length chunk. If the client closes the
    connection without sending it, the message is incomplete.

    A proxy should detect this and respond with an error. It should
    ideally not forward the incomplete request to the target.
    """

    def test_proxy_returns_error(
        self,
        proxy_url: str,
        echo_server: EchoServer,
    ) -> None:
        """Proxy responds with an error status (4xx or 5xx)."""
        parsed = urllib.parse.urlparse(proxy_url)
        assert parsed.hostname is not None
        assert parsed.port is not None

        result = send_incomplete_chunked_request(
            host=parsed.hostname,
            port=parsed.port,
            path="/chunked-error-test",
            chunk_data=b"this body is deliberately incomplete",
        )

        # We should get some response, not a silent connection drop.
        assert result is not None, "Proxy closed connection with no response"

        # Proxy should respond with an error.
        assert result.status >= 400, (
            f"Expected error status (>= 400), got {result.status}. "
            f"The proxy may have accepted the incomplete request."
        )

        # Did the proxy forward anything to the target?
        # This is informational — either behavior is plausible
        # depending on whether the proxy buffers or streams.
        try:
            captured = echo_server.last_request(timeout=0.5)
            # Proxy forwarded a partial request before detecting the
            # error. Log it for analysis.
            print(
                f"  [info] Target received {captured.method} "
                f"{captured.path} with {len(captured.body)} bytes "
                f"(proxy forwarded before detecting incomplete body)"
            )
        except queue.Empty:
            # Proxy rejected before forwarding — also valid.
            print(
                "  [info] Target received no request "
                "(proxy rejected before forwarding)"
            )


class TestH11ClientIntegration:
    """Verify the h11 client helper works at all, separate from proxy
    behavior. Sends an incomplete request directly to the echo server
    to confirm socket-level mechanics.
    """

    def test_direct_to_echo_server(self, echo_server: EchoServer) -> None:
        """Echo server receives partial data when client drops early."""
        parsed = urllib.parse.urlparse(echo_server.url)
        assert parsed.hostname is not None
        assert parsed.port is not None

        # The echo server is a normal aiohttp server — it may or may
        # not handle the incomplete chunked request gracefully. This
        # test just verifies our h11 client doesn't crash and can
        # read/parse whatever response comes back.
        result = send_incomplete_chunked_request(
            host=parsed.hostname,
            port=parsed.port,
            path="/direct-test",
            chunk_data=b"hello",
        )

        # We should get *some* result (either a response or None).
        # The specific behavior depends on aiohttp's error handling
        # for truncated chunked bodies.
        if result is not None:
            print(f"  [info] Echo server responded with status {result.status}")
        else:
            print("  [info] Echo server closed connection with no response")

        # Drain any request the echo server may have captured.
        try:
            echo_server.last_request(timeout=0.5)
        except queue.Empty:
            pass
```

- [ ] **Step 3: Run all tests**

```bash
cd conformance && uv run pytest -v
```

Expected: all tests pass (echo server tests, proxy tests, protocol error tests). The protocol error test prints informational output about how Caddy handled the malformed request.

- [ ] **Step 4: Run full quality checks**

```bash
cd conformance && uv run ruff check . && uv run ruff format --check . && uv run pyright .
```

- [ ] **Step 5: Commit**

```bash
git add conformance/src/proxy_conformance/h11_client.py conformance/tests/test_chunked_errors.py
git commit -m "feat(conformance): add h11 client and protocol error tests"
```

---

## PoC Evaluation Criteria

After implementing all tasks, assess each question:

### 1. Echo server pattern

- Did the JSON echo body provide useful debug output?
- Did the out-of-band `last_request()` capture work reliably for all methods?
- Was the HEAD test able to validate request details without a response body?
- Were there any race conditions or timing issues with the queue?

### 2. h11 client integration

- Was h11 effective for constructing the partial chunked request?
- Was the raw response parsing adequate, or do we need a more robust parser?
- Did the test clearly demonstrate the proxy's behavior?
- How awkward was the socket-level code? Is it maintainable for more edge cases?

### 3. Proxy swapping

- Is the `--proxy` CLI option clear and extensible?
- What would need to change to add protospy as a second proxy option?
- Did Caddy's startup/shutdown work reliably?

### 4. Test data structure

- Were the `ProxyTestCase` dataclasses readable and expressive enough?
- Did the `HeaderExpectation` (present/contains/absent) cover the needed assertions?
- Was the parametrize pattern clear in test output (test IDs, failure messages)?
- What assertion types are missing for the full suite?

### Observations to record

Note any unexpected proxy behavior discovered during testing — these are valuable inputs for the full conformance spec. For example:
- Does Caddy add a Via header by default?
- Which hop-by-hop headers does Caddy strip vs. forward?
- How does Caddy handle the incomplete chunked request (buffer vs. stream, error code)?

## Not in PoC Scope

The following are needed for the full suite but deliberately excluded from this PoC:

- **h11-based target server** for sending malformed responses (truncated bodies, bad chunked encoding, delayed 100-continue)
- **Configurable response headers** on the echo server (for testing response header passthrough like Cache-Control)
- **Caddy access log capture** (JSON log reading in a background thread)
- **curl integration** for tests needing `--expect100-timeout` or similar fine-grained client control
- **Full test case catalog** covering all of RFCs 9110/9112
- **CI integration** (GitHub Actions workflow for the conformance suite)
- **Connection-level observations** (e.g., verifying the proxy doesn't forward Connection header values)
- **Trailer handling**, **100-continue**, **chunked response errors**
- **De facto standards** (X-Forwarded-For, X-Forwarded-Proto)
