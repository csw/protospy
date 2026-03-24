# Plan: Full Conformance Test Suite Implementation

**Source:** `docs/conformance-test-catalog.md` (categories 1–14, 16)

**Goal:** Implement the ~65 tests described in the catalog. This
replaces the existing `test_basic_proxy.py` (whose 6 tests are
subsumed by the new per-category files) and expands
`test_chunked_errors.py` and `test_wire_server.py` into the full
coverage.

**Prerequisites:**
- WireServer rename: done
- ProxyQuirk mechanism: done
- 100-continue (8.1–8.4): done or in progress

---

## Phase 1: Infrastructure

These changes must land before the test files. They can be done in
parallel with each other.

### 1A. GoodServer: multi-value `/headers` endpoint

The current `/headers` handler uses `request.rel_url.query.items()`,
which deduplicates keys. Change to `request.rel_url.query.multi_items()`
(aiohttp's `MultiDict` method) so that
`/headers?Set-Cookie=a&Set-Cookie=b` sends two separate `Set-Cookie`
response headers.

The response construction also needs to change — `web.Response(headers=dict)`
collapses duplicates. Use `multidict.CIMultiDict` or build a
`web.Response` with an explicit header list.

Add a test in `test_good_server.py` verifying multi-value behavior.

### 1B. GoodServer: `/body/gzip` endpoint

New endpoint: `/body/gzip?size={n}` — responds with a gzip-compressed
body of `n` bytes (compresses `n` bytes of `x`), sets
`Content-Encoding: gzip`. The body is pre-compressed; the proxy should
pass it through without decompressing.

Add a test in `test_good_server.py`.

### 1C. GoodServer: verify HEAD with Content-Length

Add a test in `test_good_server.py`: `HEAD /body/content-length?size=5000`
should return `Content-Length: 5000` with an empty body. If aiohttp
doesn't behave this way, add a dedicated HEAD-aware endpoint.

### 1D. Third proxy port for upstream-unreachable tests

Add a `dead_url` / `dead_host` / `dead_port` to `ProxyUrls`. The
proxy config points this upstream at `127.0.0.1:1` (TCP discard
service — nothing will be listening, gives connection refused).

Changes:
- `ProxyUrls`: add `dead_url`, `dead_host`, `dead_port` fields
- `proxies.py`: `start_caddy` and `start_haproxy` take a
  `dead_proxy_port` parameter, add a third listener forwarding to
  `127.0.0.1:1`
- `conftest.py`: allocate `dead_port = find_free_port()`, pass to
  proxy starters, populate `ProxyUrls`
- Don't wait for the dead upstream to become ready (it won't)

### 1E. Timeout proxy fixture

`test_timeouts.py` needs a proxy with short timeouts (1–2s). Create a
**module-scoped** proxy fixture in `test_timeouts.py` (not in
`conftest.py`) that starts a separate proxy instance with:
- Caddy: `transport { dial_timeout 1s }`, `@header` matchers or
  route-level timeouts — consult Caddy docs for exact syntax
- HAProxy: `timeout connect 1s`, `timeout server 2s`

This fixture yields its own `ProxyUrls` (just a wire port — timeout
tests only need WireServer). The session-scoped servers (GoodServer,
WireServer) are shared.

### 1F. WireServer: new handler factories

These are needed by category 7, 9, and 10 tests. Add to
`wire_server.py`:

- **`silent_close()`**: Accept connection, read request, close socket
  without sending any response. For test 9.4.
- **`garbage_response(data=b"NOT HTTP")`**: Send raw non-HTTP bytes
  after receiving the request. For test 9.2.
- **`stall_before_response(seconds)`**: Read request, then
  `time.sleep(seconds)` without sending anything. For test 10.2.
  (Connection eventually closed by proxy timeout or socket teardown.)
- **`stall_mid_body(header_bytes, stall_seconds)`**: Send response
  headers and partial body, then sleep. For test 10.3.
- **`missing_final_chunk(valid_chunks)`**: Send valid chunked response
  data but omit the terminal zero-length chunk. Distinct from
  `malformed_chunks` (which sends invalid chunk-size fields). For
  test 7.4.

Existing handlers already cover:
- `truncated_body` → 9.3, 9.5
- `malformed_chunks` → 7.6
- `echo_handler` → various
- `continue_and_echo` → 8.x

Register new handlers at appropriate routes in conftest.py's
`wire_server` fixture.

### 1G. h11_client.py: new functions

- **`send_invalid_chunk_size()`**: Send a chunked POST with a
  non-hex chunk size (e.g., `ZZZZ\r\n`). For test 7.5. Similar
  structure to `send_incomplete_chunked_request`.
- **`send_raw_request_line()`**: Send a request with an arbitrary
  request-target (bypassing httpx's URL validation). For test 14.4
  (`GET /path#fragment`). Returns `RawResponse | None`.

---

## Phase 2: Happy-path test files

These files use httpx + GoodServer + `ProxyTestCase`. They are
independent and can be implemented **in parallel**. Each file is a
list of `ProxyTestCase` instances with a single parametrized test
function, following the pattern in `test_basic_proxy.py`.

### test_request_forwarding.py — Categories 1, 14

Tests: 1.1–1.8, 14.1–14.3

| Test ID | Catalog | Notes |
|---------|---------|-------|
| method-preserved | 1.1 | Parametrize over GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD |
| path-preserved | 1.2 | |
| query-string-preserved | 1.3 | |
| percent-encoding-preserved | 1.4 | |
| request-headers-forwarded | 1.5 | |
| request-body-content-length | 1.6 | **Dual purpose with 6.1** — note in comment |
| request-body-chunked | 1.7 | **Dual purpose with 6.3** — note in comment |
| empty-body-not-fabricated | 1.8 | |
| double-slashes-preserved | 14.1 | |
| dot-segments-preserved | 14.2 | |
| empty-query-preserved | 14.3 | |

Test 14.4 (fragment) uses h11 client — goes in this file but as a
separate non-`ProxyTestCase` test class, similar to how
`test_chunked_errors.py` has standalone test classes.

Test 1.1 (method-preserved) subsumes `test_basic_proxy::get-simple`,
`post-body-forwarded`, and `head-request`.

### test_response_forwarding.py — Category 2

Tests: 2.1–2.7

| Test ID | Catalog | Notes |
|---------|---------|-------|
| 2xx-status-forwarded | 2.1 | GoodServer `/echo` returns 200 |
| 3xx-status-forwarded | 2.2 | GoodServer `/redirect/301?to=/destination` |
| 4xx-status-forwarded | 2.3 | GoodServer `/status/404` |
| 5xx-status-forwarded | 2.4 | GoodServer `/status/503` |
| response-headers-forwarded | 2.5 | GoodServer `/headers?X-Custom-Response=value` |
| response-body-content-length | 2.6 | **Dual purpose with 6.2** — `/body/content-length?size=1000` |
| response-body-chunked | 2.7 | **Dual purpose with 6.4** — `/body/chunked?size=1000` |

For 2.2, use `follow_redirects=False` on the httpx client call.

### test_hop_by_hop.py — Category 3

Tests: 3.1–3.7

| Test ID | Catalog | Notes |
|---------|---------|-------|
| connection-header-stripped | 3.1 | |
| connection-named-headers-stripped | 3.2 | `Connection: X-Custom-Hop` + `X-Custom-Hop: value` |
| keep-alive-stripped | 3.3 | |
| te-stripped | 3.4 | |
| proxy-authorization-stripped | 3.5 | |
| response-hop-by-hop-stripped | 3.6 | Uses `/headers?Connection=keep-alive&Keep-Alive=timeout%3D5` |
| end-to-end-headers-not-stripped | 3.7 | Verify `Authorization`, `X-Connection-Info` survive |

Subsumes `test_basic_proxy::hop-by-hop-removal` (including its
HAProxy quirk).

### test_via_header.py — Category 4

Tests: 4.1–4.4

4.1–4.2 are request-direction (check target headers). 4.3–4.4 are
response-direction (check client headers via `/headers` endpoint).

Subsumes `test_basic_proxy::via-header-added` and
`via-header-appended`.

### test_forwarding_headers.py — Category 5

Tests: 5.1–5.4

For 5.1/5.2, X-Forwarded-For value will contain `127.0.0.1`. Use
`contains` assertion, not exact match.

For 5.3, X-Forwarded-Proto will be `http` (tests run over plaintext).

For 5.4, X-Forwarded-Host — the Host header will be
`127.0.0.1:{proxy_port}` since that's what httpx sends. Use the
proxy's good_host/good_port to construct the expected value.

**Quirks expected:** HAProxy adds X-Forwarded-For via `option
forwardfor` in the config. Caddy adds it natively. Both should work.
X-Forwarded-Proto and X-Forwarded-Host behavior may differ — Caddy
adds them by default, HAProxy may not without explicit configuration.
Discover empirically; add quirks as needed.

### test_body_framing.py — Category 6 (non-overlapping)

Tests: 6.5–6.7 only (6.1–6.4 are covered as dual-purpose tests in
categories 1 and 2 — note this in a file-level comment).

| Test ID | Catalog | Notes |
|---------|---------|-------|
| head-response-content-length | 6.5 | HEAD to `/body/content-length?size=5000` — verify Content-Length in response, empty body |
| content-length-zero | 6.6 | POST with Content-Length: 0 |
| large-body-streaming | 6.7 | POST 10 MB body. Verify arrival intact. Consider timing assertion if feasible. |

6.5 depends on 1C (HEAD verification). If aiohttp doesn't include
Content-Length for HEAD, this test needs to route through WireServer
with a custom handler instead.

6.7: 10 MB is a judgment call. If too slow, 1 MB is fine — the point
is "larger than any reasonable buffer."

### test_header_passthrough.py — Categories 11, 12, 13

Parametrized groups.

**11.1 — Cache response headers (parametrized):**
Use `/headers` endpoint. One `ProxyTestCase` per header, or a single
parametrized test over a list of `(header_name, header_value)` tuples.
The parametrized approach is cleaner.

Headers: Cache-Control, Expires, ETag, Last-Modified, Age, Vary, Pragma.

**11.2 — Cache request headers:**
Send If-None-Match, Cache-Control as request headers. Verify at
target. Single ProxyTestCase.

**12.1 — Content response headers (parametrized):**
Same pattern as 11.1. Headers: Content-Type, Content-Encoding,
Content-Language, Content-Disposition, Content-Range.

**12.2 — Content-Encoding not altered:**
Depends on 1B (`/body/gzip` endpoint). Send `Accept-Encoding: gzip`,
verify response has `Content-Encoding: gzip` and body is still
compressed (not decompressed by proxy). May need to disable httpx's
auto-decompression for this assertion.

**13.1 — Multiple values for same header:**
Send two `Accept` headers. Verify both values at target. May need
httpx's `headers` parameter as a list of tuples (not a dict) to send
duplicate headers.

**13.2 — Set-Cookie preserved separately:**
Depends on 1A (multi-value `/headers` endpoint). Use
`/headers?Set-Cookie=a%3D1&Set-Cookie=b%3D2`. Verify two separate
Set-Cookie headers in client response (not comma-joined). Use
`HeaderExpectation.count` to assert count == 2.

**13.3 — Header value whitespace:**
Send `X-Spaced: value  with   spaces`. Verify preserved at target.

---

## Phase 3: Error and edge-case test files

These use WireServer, h11 client, or non-standard proxy configurations.
Some depend on Phase 1 infrastructure.

### test_chunked_edge_cases.py — Category 7

Absorbs and expands the existing `test_chunked_errors.py` and the
chunked-related tests from `test_wire_server.py`.

| Test ID | Catalog | Infrastructure | Notes |
|---------|---------|----------------|-------|
| request-trailers | 7.1 | h11 client + WireServer echo | Client sends chunked request with trailers. Use h11 to construct. Verify trailers at WireServer. |
| response-trailers | 7.2 | GoodServer `/chunked-with-trailers` | Already have the endpoint. Verify trailers reach client. |
| missing-final-chunk-request | 7.3 | Existing `send_incomplete_chunked_request` | **Absorb from test_chunked_errors.py** including quirks. |
| missing-final-chunk-response | 7.4 | WireServer `missing_final_chunk` handler | Client gets 502 or connection drop. |
| invalid-chunk-size-request | 7.5 | h11 client `send_invalid_chunk_size` | Client gets 400. |
| invalid-chunk-size-response | 7.6 | **Absorb from test_wire_server.py** (malformed-chunks test) | |
| trailer-header-announces | 7.7 | h11 client | Like 7.1 but with explicit `Trailer:` header. |

Tests 7.1, 7.5, and 7.7 need new h11 client functions for sending
chunked requests with trailers and invalid chunk sizes. The h11 client
can construct trailers by sending `EndOfMessage(headers=[(name, value)])`.

### test_upstream_errors.py — Category 9

Absorbs the existing `test_wire_server.py` tests and adds new ones.

| Test ID | Catalog | Handler | Notes |
|---------|---------|---------|-------|
| upstream-unreachable | 9.1 | N/A — uses `dead_url` | Depends on 1D. Expect 502. |
| upstream-malformed-response | 9.2 | `garbage_response` | |
| upstream-drops-after-headers | 9.3 | `truncated_body` (existing) | **Absorb from test_wire_server.py** |
| upstream-drops-before-response | 9.4 | `silent_close` | |
| upstream-content-length-mismatch | 9.5 | `truncated_body` (existing) | Same as 9.3 conceptually |

Tests 9.3 and 9.5 overlap (both are "upstream sends fewer bytes than
Content-Length"). Keep 9.3 (drops after headers, 0 body bytes) and 9.5
(partial body, some bytes sent) as separate tests with different
`truncated_body` configurations.

### test_timeouts.py — Category 10

Depends on 1E (timeout proxy fixture) and 1F (stalling handlers).

| Test ID | Catalog | Handler | Notes |
|---------|---------|---------|-------|
| upstream-connection-timeout | 10.1 | N/A — dead port | Expect 504. Tricky: connection refused ≠ timeout. May need a firewall-dropped port or bind-but-never-accept socket. See discussion below. |
| upstream-header-timeout | 10.2 | `stall_before_response` | Expect 504. |
| upstream-body-stall | 10.3 | `stall_mid_body` | Expect 502 or connection close. |
| client-body-stall | 10.4 | h11 client | Send headers with Content-Length, then stall. Expect 408 or connection close. |
| idle-connection-timeout | 10.5 | N/A | Hold connection open after response. Expect connection closed. |

**10.1 nuance:** `127.0.0.1:1` gives connection *refused* (immediate
failure = 502), not a timeout (slow failure = 504). For a true
connection timeout, options:
- Bind a socket but never call `accept()` — backlog fills, then
  connection times out. WireServer could have a "black hole" mode.
- Use a non-routable IP like `192.0.2.1` — but behavior varies by OS.
- Defer 10.1 to a later iteration and document the challenge.

Recommendation: implement 10.2–10.5 now (they're straightforward with
stalling handlers), defer 10.1 as it needs experimentation.

---

## Phase 4: Cleanup and verification

### 4A. Remove test_basic_proxy.py

All 6 tests are subsumed:
- `get-simple` → `test_request_forwarding::method-preserved` (GET case)
- `via-header-added` → `test_via_header::4.1`
- `via-header-appended` → `test_via_header::4.2`
- `hop-by-hop-removal` → `test_hop_by_hop::3.1/3.3` (including HAProxy quirk)
- `post-body-forwarded` → `test_request_forwarding::method-preserved` (POST case) + `1.6`
- `head-request` → `test_request_forwarding::method-preserved` (HEAD case)

Delete the file after verifying the replacements pass.

### 4B. Absorb test_chunked_errors.py and test_wire_server.py

The tests from these files are absorbed into `test_chunked_edge_cases.py`
and `test_upstream_errors.py` respectively. Preserve the existing
quirks (`_QUIRKS` dict for incomplete chunked request). Delete the
original files after verifying.

### 4C. Verify

For each proxy (`--proxy caddy`, `--proxy haproxy`):
- All quality checks pass
- All tests pass (or are properly marked xfail/skip via quirks)
- No stale test files remain
- Findings summary is reviewed for new proxy-specific behaviors

### 4D. Update conformance-test-catalog.md

Add a "Status" column or checkmarks to the catalog indicating which
tests are implemented. This makes it easy to see coverage at a glance.

---

## Execution guidance

**Parallelism:** All Phase 2 files are independent and can be
implemented simultaneously by separate agents. Phase 3 files depend
on their respective Phase 1 infrastructure items.

**Dependency graph:**
```
1A ──→ test_header_passthrough (13.2)
1B ──→ test_header_passthrough (12.2)
1C ──→ test_body_framing (6.5)
1D ──→ test_upstream_errors (9.1)
1E ──→ test_timeouts
1F ──→ test_chunked_edge_cases (7.4), test_upstream_errors (9.2, 9.4),
       test_timeouts (10.2, 10.3)
1G ──→ test_chunked_edge_cases (7.5), test_request_forwarding (14.4)
```

**Order of implementation:** Infrastructure (Phase 1) first, then
Phase 2 and 3 in parallel, then Phase 4 cleanup.

**Discovering quirks:** Don't try to predict quirks for Caddy or
HAProxy. Implement each test with the RFC-correct expectation, run
against both proxies, and add `ProxyQuirk` entries for observed
deviations. This is faster and more reliable than guessing.
