# Bug: Caddy State Pollution Between Conformance Tests

## Summary

When conformance tests are run together in a single session, results for some
tests depend on which tests ran before them. Specifically,
`TestIncompleteChunkedRequest::test_proxy_returns_error` produces different
outcomes depending on whether earlier tests have warmed up Caddy's connection
pool to the good upstream.

## Observed Behaviour

| Run mode | Result |
|----------|--------|
| `test_chunked_errors.py` in isolation | **FAIL** — Caddy returns 200 (test expected 502) |
| Full suite run (default order) | **PASS** — Caddy returns 502 |

Both outcomes represent real Caddy behaviour — neither is a test framework
artefact. The inconsistency is that the test's expected value (`502`) was
calibrated from a full-suite run rather than an isolated one.

## Root Cause

All integration fixtures — `proxy` (Caddy process), `good_server` (aiohttp),
and `wire_server` — are `scope="session"`. A single Caddy instance and a single
pair of upstream servers serve every test in the session. Caddy accumulates
connection-pool state as the session progresses.

**Default test collection order** (alphabetical by file):

1. `test_assertions.py` — no Caddy
2. `test_wire_server.py` — requests via `wire_url` only
3. `test_basic_proxy.py` — six well-formed requests via `good_url`
4. `test_chunked_errors.py` — incomplete chunked POST via `good_url`
5. `test_good_server.py` — no Caddy

By the time `test_chunked_errors.py` runs, `test_basic_proxy.py` has made six
successful requests through the good upstream port. Those requests leave Caddy
with one or more keep-alive connections to `good_server` in its connection pool.

**Why the result differs:**

- **Cold Caddy (isolated run):** No pooled connections to `good_server`. Caddy
  opens a fresh TCP connection, begins streaming the chunked POST, and aiohttp
  accepts and responds to the partial body with 200. Caddy passes that 200
  back to the test client.

- **Warm Caddy (after basic proxy tests):** Caddy has a live keep-alive
  connection to `good_server`. When it receives the incomplete chunked POST,
  the interaction between its chunked-body buffering logic and the warm
  connection causes it to detect or react to the premature `SHUT_WR` before
  the upstream responds, and it returns 502.

The `wire_server` tests (which use the separate `wire_url` port and a separate
Caddy server block) are not directly involved. The warming agent is
`test_basic_proxy.py`.

## Why `_EXPECTED_STATUS["caddy"] = 502` Is Wrong

The expected value was set by observing a full-suite run. It reflects Caddy's
behaviour only when the connection pool is pre-warmed — which is not a
condition the test controls or guarantees. The isolated, reproducible Caddy
behaviour for an incomplete chunked request is **200**: Caddy proxies the
request through without rejecting it at the gateway.

## Affected Test

```
tests/test_chunked_errors.py::TestIncompleteChunkedRequest::test_proxy_returns_error
```

The `_EXPECTED_STATUS` dict drives a hard assertion on the status code for
known proxy types. The caddy entry is wrong for isolated runs and fragile for
combined runs because it relies on implicit ordering.

## Broader Risk

Any session-scoped fixture that wraps a stateful process (Caddy, or a future
proxy under test) is subject to this class of problem. Connection pools,
circuit breakers, and error counters inside the proxy can all be affected by
earlier tests in ways that are invisible at the test-code level. This makes it
possible to write tests that appear to pass reliably in CI (where they always
run in a fixed order) but fail or produce misleading findings when run in
isolation or in a different order.

## Root Cause Investigation

See `docs/process/findings-caddy-pool-state-behavior.md` for a full investigation of *why* Caddy returns different status codes depending on pool state.

**Short answer:** the 200 vs 502 difference is a race condition between two concurrent events in Caddy's reverse-proxy path — the client's `SHUT_WR` canceling the Go request context versus aiohttp closing the upstream TCP connection without sending a response. Cold-pool connections (new TCP handshake) reliably let context cancellation win → 200. Warm-pool connections (no handshake overhead) let the upstream EOF arrive first → 502.

## Remediation Options

**Option A — Fix the expected value (minimal fix)**
Change `_EXPECTED_STATUS["caddy"]` to `200`, or remove the caddy entry
entirely so the test only asserts `result.status >= 400`. This makes the test
accurate for the isolated, true Caddy behaviour, but the test would then pass
for the wrong reason in a combined run (Caddy would return 502 due to pool
warming, but the assertion would also accept 200).

**Option B — Isolate Caddy per test module (correct fix)**
Change the `proxy` fixture scope from `"session"` to `"module"`. This gives
each test file a fresh Caddy and fresh upstream connections, eliminating
cross-file state pollution at the cost of Caddy startup time per module (~0.5s
each).

**Option C — Explicit pool warm-up in the test (targeted fix)**
Add a setup step inside `TestIncompleteChunkedRequest` that makes one normal
request through `proxy.good_url` before the incomplete chunked request. This
makes the test self-contained with respect to connection-pool state, regardless
of run order.

**Option D — Accept as a known finding**
The conformance suite's primary purpose is to characterise proxy behaviour, not
to enforce it. Leave the test as a finding-only test (no hard status assertion)
and note in the finding that Caddy's response depends on whether its connection
pool is warm.

Option B eliminates the problem class entirely; Options C and D address only
this specific test. Option A is a paperover and not recommended.

## Reproduction

```bash
cd conformance

# Fails (expected 502, got 200):
uv run pytest "tests/test_chunked_errors.py::TestIncompleteChunkedRequest::test_proxy_returns_error" -v

# Passes (Caddy warmed by basic_proxy tests, returns 502):
uv run pytest tests/test_basic_proxy.py "tests/test_chunked_errors.py::TestIncompleteChunkedRequest::test_proxy_returns_error" -v
```
