# conformance/ — Architecture

> Agent-facing architecture doc. Keep this file in sync with the code AND with the `## Architecture` section of `conformance/README.md` whenever you change harness code or directory structure.

## Purpose & overview

`conformance/` is a standalone end-to-end HTTP reverse-proxy conformance test suite. It runs the same battery of HTTP-behavior tests against multiple proxies (Caddy, HAProxy, protospy) to verify that protospy is a correct transparent reverse proxy.

- For the testing concept, assertion policy, quirks, and findings model, see [`docs/conformance-tests.md`](../docs/conformance-tests.md).
- For the catalog of what behaviors are tested (categories 1–19, detailed requirements), see [`docs/conformance-test-catalog.md`](../docs/conformance-test-catalog.md).

This document covers the code and harness: how a test is structured, what each module does, and how the fixtures wire everything together.

---

## Libraries & tools

From `pyproject.toml`:

| Package | Role |
|---|---|
| `pytest` | Test runner; custom options (`--proxy`, `--findings`, `--show-http`) added via `conftest.py` |
| `pytest-xdist` | Parallel test execution (`-n auto`); workers are grouped by `<module>:<proxy_type>` to share module-scoped fixtures |
| `httpx` | High-level HTTP client used in most conformance tests; also provides the shared `client` session fixture |
| `h11` | Low-level HTTP/1.1 state-machine library; used by `WireServer` (target) and `h11_client` (test client) to construct or inject protocol violations |
| `h2` (hyper-h2) | HTTP/2 protocol state machine; used by `H2cServer` to accept h2c connections from the proxy |
| `grpcio` | gRPC runtime; used by `GrpcServer` to serve gRPC RPCs and by test code to make gRPC calls |
| `protobuf` | Generated code for the Echo service proto (`src/proxy_conformance/proto/`) |
| `aiohttp` | Async HTTP framework; the backing server for `GoodServer` |
| `multidict` | Case-insensitive multi-value dict; used in `GoodServer` to capture multi-valued headers faithfully |
| `websockets` | WebSocket library; used in connection-upgrade conformance tests |
| `typer` | CLI framework; each server module exposes a `_cli` entry point so servers can be started standalone for debugging |

Dev-only: `grpcio-tools` (proto code generation), `pyright` (type checker), `ruff` (linter/formatter).

---

## General design

### Multi-proxy parametrization

Every test that requests the `proxy_type` fixture (directly or via `proxy`, `proxy_name`, or `timeout_proxy`) is automatically parametrized over the proxy list selected with `--proxy` (default: `caddy,haproxy`). The `pytest_generate_tests` hook in `tests/conftest.py` drives this.

Running a test therefore means:

1. The `proxy` fixture starts target servers (GoodServer, WireServer, GrpcServer, H2cServer) once per session.
2. For each proxy type, the `proxy` module-scoped fixture starts the proxy subprocess against those target servers and yields a `ProxyUrls` object with the client-facing URLs.
3. The test body sends HTTP via httpx (or raw via h11_client) to the proxy frontend and asserts both the client-side response and the request captured at the target.

### The `--proxy` option

`--proxy` accepts a comma-separated list of proxy names or family names. `--proxy protospy` expands to `protospy-bypass,protospy-capture`. `--proxy all` runs all managed proxies (caddy, haproxy, protospy-bypass, protospy-capture). `--proxy protospy-ext` connects to a pre-running protospy instance (disables xdist because target servers bind fixed ports).

### Target servers vs proxy frontends

Each proxy is configured with three channels:

| Channel | Target server | Proxy frontend | Purpose |
|---|---|---|---|
| `good` | GoodServer (aiohttp) | proxy good port | Well-behaved HTTP; used for most tests |
| `wire` | WireServer (h11) | proxy wire port | Programmable raw responses; used for error/edge-case tests |
| `dead` | (nothing listens) | proxy dead port | Intentionally unreachable upstream; used for 502/504 tests |

Additional channels for specific test categories:

| Channel | Target server | Purpose |
|---|---|---|
| `grpc` | GrpcServer (grpcio) | gRPC over h2c proxying (category 17) |
| `h2c` | H2cServer (hyper-h2) | HTTP/1.1 → h2c bridging (category 18) |

Ports are allocated per-worker to avoid collisions when xdist runs tests in parallel. Each xdist worker gets a 16-port block starting at `19000 + worker_index * 16`; slots 0–3 are for session-scoped servers, slots 4–9 are for proxy listen ports.

### Proxy targets taxonomy

Defined in `src/proxy_conformance/targets.py`:

- `MANAGED_PROXIES`: started and stopped by the `proxy` fixture — `caddy`, `haproxy`, `protospy-bypass`, `protospy-capture`.
- `ALL_PROXIES`: includes `protospy-ext` (externally managed, not auto-started).
- `PROXY_FAMILIES`: maps family name → frozenset of concrete names. `protospy` family = `{protospy-bypass, protospy-capture, protospy-ext}`. Used so `xfail_for("protospy")` and `proxy_quirks={"protospy": ...}` apply to every variant.

protospy has two managed variants: `protospy-bypass` (no `PRINT_MESSAGES`; exercises the bypass code path) and `protospy-capture` (`PRINT_MESSAGES=true`; forces the capture/body-prefetch path). Both must behave identically as HTTP proxies; mode-specific divergence is treated as a bug.

---

## Architectural patterns

### Reference-proxy comparison model

Tests do not assert against a fixed ideal in isolation. Instead, every test runs against all selected proxies with per-proxy expectations. Caddy and HAProxy serve as reference proxies: if they pass a test, the test is validated as correct. If protospy deviates, that is caught by the same assertion. See [`docs/conformance-tests.md`](../docs/conformance-tests.md) for the full policy.

### Quirk / finding mechanism

A `ProxyQuirk` in `proxy_quirks` for a test case describes a known deviation for one proxy:

- `"override"`: the proxy legitimately behaves differently; assert the override expectation instead. Also record a `finding` via `findings.record(test_id, message, "finding")`.
- `"xfail"`: the proxy has a known bug; mark the test as expected-failure.
- `"skip"`: the proxy cannot run this test at all.

Findings are collected across workers (via xdist report sections) and shown with `--findings` or written to the GitHub Actions step summary.

### ProxyTestCase mechanism and `xfail_for`

`ProxyTestCase` (in `types.py`) is the structured test-case dataclass for assertion-heavy tests. It holds a `RequestSpec` (what to send), `TargetExpectation` (what should arrive at the upstream), `ClientExpectation` (what the client should receive), and `proxy_quirks` for per-proxy overrides. `assert_proxy_test_case()` applies quirks and runs both sides of the assertion in one call.

For tests that do not use `ProxyTestCase` (e.g., tests involving raw h11 interactions or gRPC), the `@pytest.mark.xfail_for("protospy")` marker applies an xfail for every proxy in the named family. This is handled by the `check_xfail_for` autouse fixture.

### Good / wire / dead channels

Tests choose a channel depending on what behavior they need to elicit:

- **good channel**: normal conformance assertions (request forwarding, header handling, response forwarding). Uses GoodServer for realistic request capture.
- **wire channel**: protocol-level misbehavior from the upstream (truncated body, malformed chunks, malformed responses, stalls). Uses WireServer with registered path handlers.
- **dead channel**: upstream is unreachable (nothing listening). Used for 502/504 tests where the proxy must generate its own error response.

---

## High-level structure / file map

```
conformance/
├── pyproject.toml          # dependencies, pytest config, entry points
├── conftest.py             # ROOT conftest: early hooks only (protospy-ext xdist disable)
├── src/proxy_conformance/  # installable package — the harness infrastructure
│   ├── targets.py          # proxy taxonomy: MANAGED_PROXIES, ALL_PROXIES, PROXY_FAMILIES
│   ├── types.py            # ProxyTestCase, ProxyQuirk, Outcome, assertion helpers
│   ├── captured.py         # CapturedRequest: shared request-capture dataclass
│   ├── good_server.py      # GoodServer: aiohttp target with route-based endpoints
│   ├── wire_server.py      # WireServer: h11 target for programmable raw responses
│   ├── h2c_server.py       # H2cServer: cleartext HTTP/2 target (hyper-h2)
│   ├── grpc_server.py      # GrpcServer: gRPC echo service (grpcio)
│   ├── h11_client.py       # Low-level HTTP/1.1 test client for protocol violations
│   ├── httpx_util.py       # curl-v style request/response formatting
│   ├── net.py              # PortAllocator, worker_base_port, find_free_port
│   ├── request_logging.py  # Shared request logging for GoodServer/WireServer
│   └── proto/              # Generated protobuf/gRPC code for the Echo service
│       ├── echo.proto
│       ├── echo_pb2.py / echo_pb2.pyi
│       └── echo_pb2_grpc.py
└── tests/                  # SEE FRAMING NOTE BELOW
    ├── conftest.py         # (supporting infrastructure)
    ├── proxies.py          # (supporting infrastructure)
    ├── test_assertions.py  # (infra unit test)
    ├── test_good_server.py # (infra unit test)
    └── test_*.py           # (conformance tests — the primary deliverable)
```

### The `tests/` directory — critical framing

**`tests/` is NOT a conventional unit-test directory.** The conformance tests in `tests/` are the primary deliverable of the subproject — they are the product. The infrastructure code in `src/proxy_conformance/` exists to support them, not the other way around.

`tests/` contains three kinds of files:

#### Supporting infrastructure (not tests)

| File | Role |
|---|---|
| `tests/conftest.py` | All shared fixtures: proxy lifecycle (`proxy`), target server fixtures (`good_server`, `wire_server`, `grpc_server`, `h2c_server`), pytest options (`--proxy`, `--findings`, `--show-http`), `pytest_generate_tests` parametrization, `Findings` collection, xdist findings aggregation, protospy log capture |
| `tests/proxies.py` | Proxy subprocess management: `start_caddy`, `start_haproxy`, `start_protospy`, `start_proxy`; `ProxyUrls` / `ProxyConfig` / `ProxyEntry` dataclasses; port allocation helpers |

#### Infrastructure unit tests (secondary)

These test the harness machinery itself, without a proxy:

| File | What it tests |
|---|---|
| `tests/test_assertions.py` | Unit tests for `types.py` assertion helpers (`assert_headers`, `assert_client_response`, `assert_proxy_test_case`, `apply_quirk`, etc.) |
| `tests/test_good_server.py` | Unit tests for `GoodServer` endpoints in isolation (no proxy involved) |

#### Conformance tests (primary deliverable)

These run against real proxy processes and verify HTTP behavior. Each corresponds to one or more catalog categories from [`docs/conformance-test-catalog.md`](../docs/conformance-test-catalog.md):

| File | Catalog categories | Key client / target server |
|---|---|---|
| `test_request_forwarding.py` | 1 (request fundamentals), 14 (URI handling) | httpx → GoodServer |
| `test_response_forwarding.py` | 2 (response fundamentals) | httpx → GoodServer |
| `test_hop_by_hop.py` | 3 (hop-by-hop headers) | httpx → GoodServer |
| `test_via_header.py` | 4 (Via header) | httpx → GoodServer |
| `test_forwarding_headers.py` | 5 (X-Forwarded-* / Forwarded) | httpx → GoodServer |
| `test_body_framing.py` | 6 (body framing) | httpx → GoodServer/WireServer |
| `test_chunked_edge_cases.py` | 7 (chunked edge cases) | h11_client + httpx → WireServer |
| `test_100_continue.py` | 8 (100-continue) | h11_client → WireServer |
| `test_upstream_errors.py` | 9 (error responses) | httpx → WireServer / dead channel |
| `test_timeouts.py` | 10 (timeouts) | httpx → WireServer / dead channel |
| `test_header_passthrough.py` | 11 (cache headers), 12 (content headers), 13 (header preservation) | httpx → GoodServer |
| `test_connection_upgrades.py` | 15 (WebSocket upgrades) | websockets → GoodServer |
| `test_grpc.py` | 17 (gRPC / HTTP/2) | grpcio client → GrpcServer |
| `test_h2_bridging.py` | 18 (HTTP/1.1 → h2c bridging) | httpx → H2cServer |
| `test_streaming.py` | 19 (streaming response behavior) | httpx → GoodServer |

---

## Source module reference

### `src/proxy_conformance/targets.py`

Single source of truth for proxy taxonomy. Defines `MANAGED_PROXIES`, `ALL_PROXIES`, `PROXY_FAMILIES`, and `proxy_family()`. Intentionally free of test-harness imports to avoid circular dependencies with `types.py`.

### `src/proxy_conformance/types.py`

Core dataclasses and assertion helpers:

- `RequestSpec` — what the client sends.
- `TargetExpectation`, `ClientExpectation`, `ConnectionDrop`, `Outcome` — what to assert.
- `HeaderExpectation` — present/contains/absent/count assertions on headers.
- `ProxyQuirk` — per-proxy behavioral deviation (override/xfail/skip).
- `ProxyTestCase` — a complete structured test case bundling all of the above.
- `assert_proxy_test_case()` — runs both sides (client + target) of an assertion, applying quirks.
- `apply_quirk()` — used by tests that don't use `ProxyTestCase`; calls `pytest.skip`/`pytest.xfail` or returns the override quirk.
- `send_expecting_error()` / `assert_probe_result()` — for tests where the proxy may drop the connection.
- `ProbeResult` — a minimally-parsed response-or-drop result.

### `src/proxy_conformance/captured.py`

`CapturedRequest` is a shared dataclass representing an HTTP request as observed by a target server. Both `GoodServer` and `WireServer` produce `CapturedRequest` instances (WireServer via its `WireCapturedRequest` subclass which adds wire-only fields like `trailers`). Lives in its own module to avoid peer dependencies between the server implementations.

### `src/proxy_conformance/good_server.py`

`GoodServer` is an aiohttp-based target server with endpoint-based routing. It runs in a background thread, captures every request into a queue, and exposes `last_request()` for test assertions. Endpoints include `/echo`, `/status/{code}`, `/redirect/{code}`, `/headers`, `/body/chunked`, `/body/content-length`, `/chunked-with-trailers`, `/ws/echo`, `/ws/reject`. Exposes a `_cli` entry point (`good-server`) for standalone debugging.

### `src/proxy_conformance/wire_server.py`

`WireServer` is a raw TCP listener backed by h11 for request parsing. Handlers are callables `(h11.Request, bytes, socket.socket, h11.Connection) → None` registered to URL paths. Handlers can send well-formed responses, deliberately broken responses (truncated body, malformed chunks), or stall. Included handler helpers: `truncated_body()`, `malformed_chunks()`. Exposes a `_cli` entry point (`wire-server`). `register_default_routes()` installs the standard routes used by the fixtures.

### `src/proxy_conformance/h2c_server.py`

`H2cServer` accepts cleartext HTTP/2 connections using hyper-h2, captures each request (pseudo-headers + regular headers + body length) as a `CapturedH2Request`, and echoes it back as JSON. Used by H1-to-h2c bridging tests to assert on how the proxy translates HTTP/1.1 frames. Exposes a `_cli` entry point (`h2c-server`).

### `src/proxy_conformance/grpc_server.py`

`GrpcServer` serves the `Echo` gRPC service over h2c (cleartext HTTP/2). Implements `UnaryEcho`, `ServerStream`, and `BidiStream` methods; supports triggering errors via sentinel messages (`__error__`, `__slow__`). Exposes a `_cli` entry point (`grpc-server`).

### `src/proxy_conformance/h11_client.py`

Low-level HTTP/1.1 test client for constructing protocol violations. Key functions: `send_incomplete_chunked_request()` (sends a chunked POST without the terminal zero-length chunk), `send_with_expect_continue()` (implements the 100-continue handshake). Uses h11 for request framing, then custom parsing for the response because h11's state machine would reject reading a response while it thinks the request body is still in progress.

### `src/proxy_conformance/net.py`

Port allocation utilities. `find_free_port()` binds port 0 to obtain an OS-assigned free port. `PortAllocator` assigns deterministic ports within a worker's 16-port block (`worker_base_port()` maps xdist worker IDs to base ports starting at 19000). Slots 0–3 for session-scoped servers, slots 4–9 for proxy listen ports.

### `src/proxy_conformance/httpx_util.py`

Debug formatting helpers. `dump_request()` and `dump_response()` format httpx objects for DEBUG-level logging. `verbose_request_hook` and `verbose_response_hook` are httpx event hooks that print curl-`v`-style output to stderr when `--show-http` is passed.

### `src/proxy_conformance/request_logging.py`

Thin shared helper: `log_request()` prints a one-line summary of a received request to stderr, used by both `GoodServer` and `WireServer`.

### `src/proxy_conformance/proto/`

Generated protobuf and gRPC stubs for the `Echo` service (`echo.proto`). `echo_pb2.py` and `echo_pb2_grpc.py` are committed generated artifacts; `echo_pb2_grpc.py` is excluded from ruff linting. To regenerate: `grpcio-tools` is in the dev dependency group.

---

## `conftest.py` files

### `conformance/conftest.py` (root)

Contains only the `pytest_configure` hook (marked `tryfirst=True`). When `--proxy protospy-ext` is in the proxy list, it disables xdist (`numprocesses=0`, `tx=[]`, `dist="no"`) before xdist's own configure hook registers `DSession`, and applies fixed target-server port defaults (7300/7301) unless already overridden. Must live in the root conftest (not `tests/`) so it runs in the main process before collection, not in xdist workers.

### `tests/conftest.py`

All runtime fixtures and hooks. Key items:

- `pytest_addoption`: registers `--proxy`, `--proxy-url`, `--findings`, `--show-http`, and the protospy-ext port flags.
- `pytest_generate_tests`: parametrizes every test requesting `proxy_type` (or derived fixtures) over the `--proxy` list.
- `pytest_collection_modifyitems`: assigns `xdist_group` markers so `--dist loadgroup` keeps tests sharing a module-scoped `proxy` fixture on the same worker.
- `check_xfail_for` (autouse): resolves `@pytest.mark.xfail_for("<family>")` markers at runtime against the active `proxy_type`.
- `protospy_binary` (session): builds protospy once per run using `cargo build`; coordinates across workers via a file lock and sentinel file.
- `good_server`, `wire_server`, `grpc_server`, `h2c_server` (session): start target servers once per worker session.
- `proxy` (module): starts/stops the proxy subprocess for one module × proxy_type combination.
- `client` (session): shared httpx client with `trust_env=False`.
- `Findings` class and `findings` fixture: collects `(test_id, message, level)` tuples within a worker; serialized to xdist report sections and aggregated by the controller.
- `_protospy_output_capture` (autouse): captures protospy log output between test start and failure, attaching it to the failure report section.
