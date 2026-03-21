# Conformance Infrastructure Improvements

Improvements to bring the PoC conformance test suite to production quality, prior to implementing the full test catalog. These are drawn from the design notes (`docs/process/conformance-design-notes.md`), both PoC reviews, and subsequent design discussions.

This document organizes improvements into discrete work units, each suitable for a single agent session. Work units are independent unless noted.

---

## Work Unit A: Small mechanical cleanups

Self-contained refactors with no design decisions. Can be done in any order or all at once.

### A1. Rename `rfc_ref` to `spec_ref`

Find-and-replace across types.py and all test files. Accommodates non-RFC specs like X-Forwarded-For (MDN references).

### A2. Unify h11_client header representation

Change `RawResponse.headers` from `dict[str, str]` to `dict[str, list[str]]`. Update `_parse_raw_response` to accumulate multi-valued headers. Update test_chunked_errors.py if it reads from `RawResponse.headers`.

### A3. Consolidate `_find_free_port`

Currently defined in good_server.py, wire_server.py, and conftest.py. Move to a shared module (e.g., `proxy_conformance.net`) and import from there.

### A4. Public method for WireServer handler exceptions

The `_check_wire_server` fixture in conftest.py accesses `wire_server._handler_exception` directly. Add a public method like `raise_if_handler_failed()` on WireServer and call that from the fixture instead.

---

## Work Unit B: GoodServer endpoints

**Depends on:** Nothing. **Unlocks:** Most response-forwarding tests in the catalog (categories 2, 3 response-direction, 4 response Via, 11, 12).

### Current state

GoodServer handles all paths identically — echoes the request as JSON. This is sufficient for request-forwarding tests but not for tests that need specific response status codes, headers, or body framing from the upstream.

### Change

Add endpoint-based routing. Move the echo behavior to `/echo`. Add endpoints for configurable responses:

- `/echo` and `/echo/{anything}` — current behavior (echo request details as JSON, out-of-band capture). The `{anything}` suffix allows test-name-in-path-info.
- `/status/{code}` and `/status/{code}/{anything}` — respond with the given status code and a minimal body (e.g., `{"status": 404}`).
- `/redirect/{code}?to={url}` — respond with the given redirect status and `Location` header.
- `/headers?Name=value&Name2=value2` — respond with 200 and include the query parameters as response headers. For testing header passthrough.
- `/body/chunked?size={n}` — respond with a chunked body of n bytes. For testing chunked response framing.
- `/body/content-length?size={n}` — respond with a Content-Length-framed body of n bytes.
- `/chunked-with-trailers?Trailer-Name=value` — respond with a chunked body including trailer fields specified by query params.

### Design constraints

- All endpoints capture the request via the existing out-of-band queue. Target-side assertions work the same way regardless of endpoint.
- Unknown paths return 404 (not echo). Typos in test paths fail fast.
- Keep the endpoint set minimal — the above list covers what the current test catalog needs. Add more when tests need them.

### Tests

Add tests for the new endpoints in test_good_server.py: verify each endpoint returns the expected status/headers/body, and that out-of-band capture works for all of them.

---

## Work Unit C: Expanded assertion types

**Depends on:** Nothing (but most useful after B). **Unlocks:** Error-handling tests, response-forwarding tests, header preservation tests.

### Current state

`HeaderExpectation` supports: `present` (exact value in list), `contains` (substring), `absent`. `ClientExpectation` has `status: int` (exact match only) and no body field. `TargetExpectation` has no way to express "no request should arrive."

### Changes

#### C1. Header value count

Add `count: dict[str, int]` to `HeaderExpectation` — assert that a header name appears exactly N times. Needed for "proxy should not duplicate Host" (catalog 13.1).

Update `assert_headers` to check the count field.

#### C2. Status range / set

Allow `ClientExpectation.status` to express ranges. Simplest approach: add an optional `status_in: set[int] | None` field. When set, check status is in the set. The existing `status: int` field remains the default for exact-match cases. Alternatively, accept `int | set[int]` for `status` directly — pick whichever is simpler to implement and use.

#### C3. Response body assertions

Add to `ClientExpectation`:
- `body: bytes | None = None` — exact match
- `body_contains: bytes | None = None` — substring match

#### C4. Negative target assertion

Add `no_request: bool = False` to `TargetExpectation`. When true, the test runner asserts that the GoodServer queue is empty (with a short timeout), meaning the proxy rejected the request before forwarding.

#### C5. Update test runner

The test function in test_basic_proxy.py needs to handle the new assertion fields. This is also a good time to extract the assertion logic into a helper function that both test_basic_proxy.py and future test files can call, rather than having each test file reimplement the assertion pattern.

### Tests

Unit-test the assertion helpers directly (e.g., verify that `assert_headers` correctly checks the `count` field, that status range matching works). These are fast tests that don't need servers.

---

## Work Unit D: Proxy-specific expectations

**Depends on:** C (uses expanded assertion types). **Unlocks:** Error-handling tests that behave differently across proxies.

### Problem

Different proxies handle the same upstream errors differently:
- Missing final chunk in client request: Caddy returns 502, protospy should return 400
- Truncated upstream body: Caddy drops the connection without responding, others return 502
- Malformed upstream chunks: same — Caddy drops, others return 502

The current tests handle this with ad hoc `try/except httpx.RemoteProtocolError`. This doesn't scale.

### Changes

#### D1. Response-or-disconnect helper

Provide a helper for sending requests where the proxy might return an error status OR drop the connection. Something like:

```
result = send_expecting_error(client, url)
# result.status is int | None (None = connection dropped)
# result.body, result.headers available if status is not None
```

Tests assert on the result object rather than catching exceptions.

#### D2. Per-proxy expectation overrides

Add `proxy_overrides: dict[str, ClientExpectation] | None` to `ProxyTestCase`. When the current proxy (from `--proxy`) has an entry in the overrides dict, use that expectation instead of `expect_at_client`.

The override mechanism should also support skipping a test for a given proxy (e.g., `pytest.skip` if the proxy doesn't implement a feature). A sentinel value in the overrides dict could signal this.

The test runner reads `--proxy` from the pytest config and resolves expectations before asserting.

#### D3. Migrate existing error tests

Update test_wire_server.py and test_chunked_errors.py to use the new mechanisms instead of ad hoc try/except.

---

## Work Unit E: Structured findings

**Depends on:** Nothing. **Improves:** All error-handling and behavioral-observation tests.

### Current state

Tests use `print("  [finding] ...")` and `print("  [info] ...")` for proxy behavioral observations. These interleave with pytest output and are easy to miss.

### Change

Create a session-scoped `Findings` collector:
- Tests call `findings.record(test_id, message, level)` where level is "info" or "finding"
- A `pytest_terminal_summary` hook prints all collected findings at the end of the test session, grouped by level
- Expose as a pytest fixture

This is lightweight — a list that gets printed at the end. The goal is making behavioral observations reviewable in one place, not building a reporting framework.

### Migration

Update test_wire_server.py and test_chunked_errors.py to use `findings.record()` instead of `print()`.

---

## Work Unit F: Test name in query parameter

**Depends on:** Nothing (no routing changes needed). **Improves:** Debugging with proxy logs, tcpdump, Wireshark.

### Change

Append a `_test={case.id}` query parameter to request URLs. Example: the `via-header-added` test sends to `/echo?_test=via-header-added` instead of `/echo`.

This is the least intrusive approach — neither GoodServer nor WireServer need any changes. The `_test` parameter rides along in the URL, appears in captured request paths (since `path` includes the query string), and is visible in proxy logs, tcpdump, and Wireshark. The underscore prefix distinguishes it from "real" query parameters an endpoint might use (e.g., `/headers?Cache-Control=no-cache&_test=hop-by-hop`).

### Implementation

The test runner (the parametrized test function) appends the parameter when constructing the request URL. For requests that already have query parameters, append with `&`; for those without, append with `?`. A small helper function to build the URL avoids repetition.

Update test_basic_proxy.py and any other test files that send requests through the proxy.

---

## Work Unit G: Proxy fixture hardening

**Depends on:** Nothing. Small and independent.

### Changes

#### G1. try/finally around Caddy lifecycle

Wrap the yield and proc.terminate() in try/finally so Caddy is always stopped, even if fixture teardown fails.

#### G2. Temp Caddyfile cleanup

Use `tmp_path_factory` (session-scoped pytest fixture) for the Caddyfile instead of `tempfile.NamedTemporaryFile(delete=False)`. This ensures cleanup.

#### G3. Pre-parsed proxy URLs

Add parsed host/port fields to `ProxyUrls` so tests that need them (like h11_client tests in test_chunked_errors.py) don't call `urllib.parse.urlparse` themselves. Either add `good_host`, `good_port`, `bad_host`, `bad_port` fields, or store `urllib.parse.ParseResult` objects alongside the URL strings.

---

## Dependency graph

```
A (mechanical cleanups)      — no dependencies
B (GoodServer endpoints)     — no dependencies
C (assertion types)          — no dependencies
D (proxy-specific expects)   — depends on C
E (structured findings)      — no dependencies
F (test name in query param) — no dependencies
G (proxy fixture hardening)  — no dependencies
```

Suggested execution order for parallel agents:
- **Batch 1:** A, B, C, E, F, G (all independent)
- **Batch 2:** D (needs C)
