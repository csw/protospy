# CLAUDE.md — conformance test suite

Also read `docs/agents/python.md` and `docs/agents/testing.md` at the repo root.

## Commands

```bash
uv run pytest -q                   # run tests (default: all managed proxies)
uv run pytest -q --proxy caddy     # run against Caddy only
uv run pytest -q --proxy haproxy   # run against HAProxy only
uv run pytest -q --findings        # show proxy behavioral findings
uv run ruff check .                # lint
uv run ruff format .               # format
uv run pyright .                   # type check
```

## Architecture

For the deep reference (full module roles, fixture wiring, channel taxonomy, source-module-by-source-module breakdown, ProxyTestCase / quirk semantics, conftest split rationale), read [`ARCHITECTURE.md`](./ARCHITECTURE.md). For the testing concept and what's tested, see [`docs/conformance-tests.md`](../docs/conformance-tests.md) and [`docs/conformance-test-catalog.md`](../docs/conformance-test-catalog.md). The TL;DR below is enough for adding a conformance test that fits an existing pattern — but if your change touches the proxy fixture lifecycle, the parametrization hook, port allocation, the quirk/findings mechanism, target-server protocols (wire/h2c/grpc), or the directory layout, you need the deep doc.

**Keep both current:** when you change harness code, the proxy taxonomy, fixture wiring, or directory structure, update `ARCHITECTURE.md`, the `## Architecture` section of `README.md`, and the TL;DR below in the same change. See [`docs/agents/tldr-maintenance.md`](../docs/agents/tldr-maintenance.md) for the regeneration prompt.

### TL;DR

**Stack.** `pytest` + `pytest-xdist` (`-n auto`, workers grouped by `<module>:<proxy_type>` via `xdist_group` so module-scoped fixtures are shared). `httpx` for high-level client calls, `h11` for HTTP/1.1 wire-level test client + `WireServer`, `h2` (hyper-h2) for `H2cServer`, `grpcio` + `protobuf` for `GrpcServer` (echo proto under `src/proxy_conformance/proto/`), `aiohttp` + `multidict` for `GoodServer`, `websockets` for upgrade tests, `typer` for each server's standalone `_cli` entry point. Dev: `ruff`, `pyright`, `grpcio-tools`. Managed with `uv`; Python `>=3.14` (`pyproject.toml`).

**Data flow.** `pytest_generate_tests` in `tests/conftest.py` parametrizes every test that requests `proxy_type` (directly or transitively) across the `--proxy` list. For each `proxy_type`, the session-scoped target servers (`good_server`, `wire_server`, `grpc_server`, `h2c_server`) come up once per xdist worker; then the module-scoped `proxy` fixture starts the proxy subprocess (`tests/proxies.py`: `start_caddy`/`start_haproxy`/`start_protospy`) against those targets and yields a `ProxyUrls`. Tests send requests through the proxy frontend (httpx via the `client` session fixture, or raw via `h11_client`) and assert both the **client response** (`ClientExpectation`) and the **request as captured at the target** (`TargetExpectation`) — typically via `assert_proxy_test_case(ProxyTestCase(...))`. Logs from protospy are captured per test by the autouse `_protospy_output_capture` and attached on failure.

**Proxy taxonomy.** `src/proxy_conformance/targets.py` is the single source of truth. `MANAGED_PROXIES` = `caddy, haproxy, protospy-bypass, protospy-capture` (started/stopped by `proxy`). `protospy-bypass` runs without `PRINT_MESSAGES`; `protospy-capture` runs with `PRINT_MESSAGES=true` — both must behave identically. `--proxy protospy` expands to both managed variants; `--proxy all` adds nothing extra; `--proxy protospy-ext` targets a pre-running protospy and **disables xdist** (root `conftest.py` does this in `pytest_configure(tryfirst=True)` before xdist registers `DSession`). `PROXY_FAMILIES["protospy"]` covers all three so `xfail_for("protospy")` and `proxy_quirks={"protospy": ...}` apply uniformly.

**Channels.** Each proxy is wired with three default upstream channels plus two optional ones; tests pick by what they need to elicit:

- **good** → `GoodServer` (aiohttp). Realistic request capture for the common case.
- **wire** → `WireServer` (h11). Programmable raw responses for truncated bodies, malformed chunks, stalls — register handlers via `register_default_routes()` or per-test.
- **dead** → nothing listens. Forces the proxy to generate its own 502/504.
- **grpc** → `GrpcServer` (grpcio over h2c) for category 17.
- **h2c** → `H2cServer` (hyper-h2) for category 18.

**Load-bearing details — don't break these:**

- `ProxyTestCase` (`types.py`) bundles `RequestSpec` + `TargetExpectation` + `ClientExpectation` + `proxy_quirks`. Use `assert_proxy_test_case()` for assertion-heavy tests; for raw h11/gRPC tests use the `@pytest.mark.xfail_for("<family>")` marker (resolved by autouse `check_xfail_for`).
- Quirk kinds are `override` (assert the override instead — also `findings.record(...)`), `xfail` (known bug), `skip` (cannot run). Findings cross workers via xdist report sections; surface with `--findings`.
- Per-worker port blocks: each xdist worker gets 16 ports starting at `19000 + worker_index * 16` (`net.py:worker_base_port`); slots 0–3 for session-scoped servers, slots 4–9 for proxy listen ports. Don't bind fixed ports — use `PortAllocator` or `find_free_port()`.
- Root `conftest.py` is intentionally minimal (early `pytest_configure` only) so xdist sees the right `numprocesses` before workers spawn. All runtime fixtures live in `tests/conftest.py`. Don't move them.
- `tests/` is the **primary deliverable**, not a unit-test directory. `tests/conftest.py` and `tests/proxies.py` are supporting infrastructure; `tests/test_assertions.py` and `tests/test_good_server.py` are infra unit tests; the rest are conformance tests mapped to catalog categories.
- `src/proxy_conformance/proto/echo_pb2_grpc.py` is generated and excluded from ruff. Regenerate via `grpcio-tools` (dev dep) rather than editing.

**Directory map (compressed; full annotations in `ARCHITECTURE.md`):**

- `conftest.py` (root) — early `pytest_configure` only (disables xdist for `protospy-ext`)
- `src/proxy_conformance/` — installable harness package:
  - `targets.py` (`MANAGED_PROXIES`, `ALL_PROXIES`, `PROXY_FAMILIES`, `proxy_family()`)
  - `types.py` (`RequestSpec`, `TargetExpectation`, `ClientExpectation`, `HeaderExpectation`, `ProxyQuirk`, `ProxyTestCase`, `assert_proxy_test_case`, `apply_quirk`, `send_expecting_error`, `ProbeResult`)
  - `good_server.py`, `wire_server.py`, `h2c_server.py`, `grpc_server.py` (target servers; each has a `_cli` for standalone debug)
  - `h11_client.py` (`send_incomplete_chunked_request`, `send_with_expect_continue`)
  - `net.py` (`PortAllocator`, `worker_base_port`, `find_free_port`)
  - `proto/` (Echo `echo.proto` + generated `echo_pb2`/`echo_pb2_grpc`)
  - small helpers: `captured.py` (shared `CapturedRequest`), `httpx_util.py` (curl-`v` dump + `--show-http` hooks), `request_logging.py` (one-line request log)
- `tests/conftest.py` — `pytest_addoption`, `pytest_generate_tests`, `pytest_collection_modifyitems` (xdist grouping), `check_xfail_for`, `protospy_binary`, target-server + `proxy` + `client` fixtures, `Findings`, `_protospy_output_capture`
- `tests/proxies.py` — proxy subprocess start helpers + `ProxyUrls`/`ProxyConfig`/`ProxyEntry`
- `tests/test_assertions.py`, `tests/test_good_server.py` — infra unit tests (no proxy)
- `tests/test_*.py` — conformance tests, one file per catalog category cluster (forwarding, hop-by-hop, Via, X-Forwarded, body framing, chunked edges, 100-continue, upstream errors, timeouts, header passthrough, connection upgrades, gRPC, h2 bridging, streaming)

## Code Quality Requirements

Before reporting work as complete or committing, **all of the following must pass**:

```bash
uv run ruff check .
uv run ruff format .
uv run pyright .
uv run pytest -q   # NOTE: needs live infra — see below; NOT part of the commit gate
```

The lint/format/type checks are enforced automatically at commit time — see
[`docs/agents/quality-gates.md`](../docs/agents/quality-gates.md). The
**conformance test run is not** enforced at commit time: unlike `flix`/`ui`, it
requires a running protospy + a managed proxy (caddy/haproxy) and is run
manually via `just conformance test`. With no proxy infra up, the bare
`uv run pytest -q` above will error — that's an environment gap, not your bug.
If you can't run it, say so explicitly rather than reporting the suite green.
When your change affects protospy's proxy behavior, run `just conformance test`
(or `uv run pytest -q --proxy protospy`, which covers both the bypass and
capture variants, which must behave identically) and review `--findings`; the
bare default run is not sufficient to validate a protospy behavior change.

## Committing

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/). Use `test` or `refactor` as the type with scope `conformance`:

```text
test(conformance): add chunked transfer-encoding probe
refactor(conformance): extract shared assertion helpers
```

Always commit `uv.lock` alongside any changes to `pyproject.toml`.
