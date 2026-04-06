# Conformance Test Catalog

Test coverage for the protospy HTTP 1.1 reverse proxy conformance suite. This document identifies what the suite must cover, organized by category, with individual test requirements for each category.

Some behaviors overlap, such that a single test verifies requirements from multiple categories. This will be noted in both test files.

## Scope

Protospy is a transparent observation proxy — it does not cache, modify bodies, perform content negotiation, or authenticate. The testing surface is everything that can go wrong or needs special handling in the request-forwarding and response-forwarding pipeline, focusing on:

- Correct forwarding of requests and responses
- Hop-by-hop header handling required by HTTP standards
- Proxy identification headers (Via, X-Forwarded-For, etc.)
- Correct body framing across hops
- Error handling when clients or upstreams misbehave
- Timeout behavior

**Caddy support as a priority heuristic**: If a behavior is too esoteric for Caddy to support, it's unlikely to be a priority for protospy. Behaviors that Caddy handles correctly can be validated against Caddy as a reference proxy.

**Assertion policy**: Every test must assert for every proxy. See [conformance-tests.md](conformance-tests.md) for the full policy on assertions, findings, and quirks.

## Categories

### 1. Request forwarding fundamentals

Tests: [test_request_forwarding.py](../conformance/tests/test_request_forwarding.py)

Baseline correctness: method, path, query string, headers, and body arrive at the upstream intact. This is the foundation — every other category builds on it.

Key concerns: path and query string preserved exactly, percent-encoding not double-encoded or decoded, request headers forwarded without mutation (except hop-by-hop), body forwarded with correct framing.

**Specs:** RFC 9110 §7.1–7.2 (Host), RFC 9112 §3 (request line)

### 2. Response forwarding fundamentals

Tests: [test_response_forwarding.py](../conformance/tests/test_response_forwarding.py)

Status code, headers, and body arrive at the client intact. Covers all status code classes (2xx, 3xx, 4xx, 5xx) and verifies the proxy doesn't mangle responses.

**Specs:** RFC 9110 §15 (status codes), RFC 9112 §4 (status line)

### 3. Hop-by-hop header handling

Tests: [test_hop_by_hop.py](../conformance/tests/test_hop_by_hop.py)

The proxy must remove hop-by-hop headers from forwarded messages in both directions. These are:

- `Connection` and any headers it names
- `Keep-Alive`
- `Trailer`
- `Transfer-Encoding` (between hops — may re-frame)
- `Proxy-Authenticate`
- `Upgrade` (except when acting on the upgrade)

Two headers listed in §7.6.1 have exceptions elsewhere in the RFC that explicitly permit forwarding:

- `TE`: §10.1.4 allows forwarding `TE: trailers`
- `Proxy-Authorization`: §11.7.1 allows relaying credentials to the next proxy

Neither Caddy nor HAProxy strips these — the tests record observed behavior as findings rather than asserting removal.

The proxy must also not forward headers listed in the `Connection` header's value (e.g., `Connection: X-Custom` means strip `X-Custom`).

**Specs:** RFC 9110 §7.6.1, §10.1.4, §11.7.1

### 4. Via header

Tests: [test_via_header.py](../conformance/tests/test_via_header.py)

The proxy must append a Via entry to forwarded requests and forwarded responses. Must preserve existing Via entries (append, not replace). The entry includes the protocol version and a proxy identifier.

**Specs:** RFC 9110 §7.6.3

### 5. Forwarding identification headers

Tests: [test_forwarding_headers.py](../conformance/tests/test_forwarding_headers.py)

De facto standard headers that identify the original client and request context:

- `X-Forwarded-For`: original client IP. Append to existing values.
- `X-Forwarded-Proto`: original scheme (http/https).
- `X-Forwarded-Host`: original Host header value.
- `Forwarded`: the standardized equivalent (RFC 7239). Lower priority than the X-Forwarded-* headers, which are more widely used.

**Specs:** RFC 7239 (Forwarded); MDN references for de facto standards: [X-Forwarded-For](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For), [X-Forwarded-Proto](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Proto), [X-Forwarded-Host](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Host), [Forwarded](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Forwarded)

### 6. Body framing

Tests: [test_body_framing.py](../conformance/tests/test_body_framing.py)

Correct handling of different body framing mechanisms:

- Content-Length bodies forwarded intact (request and response)
- Chunked bodies forwarded (proxy may re-frame between chunked and Content-Length as long as the body arrives intact and framing conforms to standards)
- No-body requests (GET, HEAD, DELETE) handled correctly
- HEAD responses: Content-Length may be present but body must be empty — proxy must not get confused or stall waiting for a body
- Content-Length: 0 vs. absent Content-Length
- Extremely large bodies: proxy must stream, not buffer entirely

**Specs:** RFC 9112 §6 (message body), §7 (transfer codings)

### 7. Chunked encoding edge cases

Tests: [test_chunked_edge_cases.py](../conformance/tests/test_chunked_edge_cases.py)

Beyond basic chunked forwarding, specific edge cases:

- Trailer fields in chunked messages (request and response) — proxy must pass through. This is important for gRPC and similar protocols that use trailers.
- Missing final zero-length chunk (client-side and upstream-side) — proxy should detect and error. Note: the appropriate error status is debatable. Caddy returns 502 (it streams the request to upstream, which rejects it). Protospy should return 400 (the client sent a malformed request). See infrastructure note below.
- Invalid chunk sizes — proxy should detect and error
- Very large individual chunks
- Chunk extensions (rarely used, but defined in the spec)

**Specs:** RFC 9112 §7.1 (chunked), §7.1.2 (trailer section), RFC 9110 §6.5 (trailer fields)

**Infrastructure requirement — proxy-specific expectations:** Some error-handling behaviors will differ between proxies due to legitimate implementation choices (e.g., whether the proxy buffers or streams the request body before forwarding). The test infrastructure must support per-proxy expected values or the ability to skip specific tests for specific proxies. This should be a general capability, not special-cased per test. Options include: a `proxy_overrides` field on test cases that maps proxy names to alternate expectations, or a marker/skip mechanism keyed on the `--proxy` option.

### 8. 100-continue

Tests: [test_100_continue.py](../conformance/tests/test_100_continue.py)

The `Expect: 100-continue` mechanism:

- Client sends request with `Expect: 100-continue` header
- Proxy forwards the request (with the Expect header) to upstream
- Upstream sends `100 Continue` — proxy forwards it to client
- Client sends request body — proxy forwards it to upstream
- Upstream sends final response — proxy forwards it to client

Edge cases:
- Upstream ignores Expect and sends the final response directly
- Upstream rejects with 417 Expectation Failed (no body should be forwarded)
- Upstream delays the 100 response (timeout behavior)
- Client sends body without waiting for 100 (proxy must handle gracefully)

**Specs:** RFC 9110 §10.1.1, RFC 9112 §9.3

### 9. Error responses

Tests: [test_upstream_errors.py](../conformance/tests/test_upstream_errors.py)

Proxy-generated error responses when something goes wrong:

- **502 Bad Gateway**: upstream unreachable (connection refused), upstream sends malformed response, upstream drops connection mid-response, upstream sends truncated body (Content-Length mismatch)
- **504 Gateway Timeout**: upstream too slow (see Timeouts below)
- **400 Bad Request**: client sends malformed request that the proxy must reject

Important: the proxy should provide meaningful error responses, not silently drop connections.

**Specs:** RFC 9110 §15.6.3 (502), §15.6.5 (504)

### 10. Timeouts

Tests: [test_timeouts.py](../conformance/tests/test_timeouts.py)

Timeout behaviors the proxy must implement. These are important for correctness and influence test suite design (timeout tests are inherently timing-sensitive).

- **Upstream connection timeout**: proxy cannot establish TCP connection to upstream → 504
- **Upstream response header timeout**: connection established, but upstream doesn't send response headers within a reasonable time → 504
- **Upstream response body stall**: upstream starts sending body, then stops mid-stream → 502 (upstream failure, not timeout in the traditional sense, but may overlap)
- **Client request body stall**: client sends request headers with body, then stops sending body → 408 Request Timeout or connection close
- **Client read stall**: client doesn't read the response fast enough (backpressure) → eventually close connection
- **Idle connection timeout**: keep-alive connection sits idle → close

Testing considerations: timeout tests need a target server (h11-based) that deliberately stalls at specific points. The timeout values used in tests must be short (to keep tests fast) but not so short that they're flaky. Consider making proxy timeout values configurable specifically for testing.

**Specs:** RFC 9110 §15.6.5 (504), §15.5.9 (408)

### 11. Cache header passthrough

Tests: [test_header_passthrough.py](../conformance/tests/test_header_passthrough.py)

Since protospy is non-caching, all cache-related headers must pass through unmodified in both directions:

- `Cache-Control`
- `Expires`
- `ETag`
- `Last-Modified`
- `Age`
- `Vary`
- `Pragma`

The test is simply "these headers are not mangled."

**Specs:** RFC 9111 (relevant sections for each header)

### 12. Content header passthrough

Tests: [test_header_passthrough.py](../conformance/tests/test_header_passthrough.py)

Content-related end-to-end headers pass through unmodified:

- `Content-Type`
- `Content-Encoding` (proxy must not decompress/recompress)
- `Content-Language`
- `Content-Disposition`
- `Content-Range`

The proxy must not alter these. Transfer-Encoding is hop-by-hop and handled in category 3.

**Specs:** RFC 9110 §8 (representations)

### 13. Header preservation details

Tests: [test_header_passthrough.py](../conformance/tests/test_header_passthrough.py)

Subtle correctness requirements around header handling:

- Multiple values for the same header name must be preserved (not collapsed into one or dropped)
- Header value ordering should be preserved where it matters (e.g., multiple `Set-Cookie` headers)
- The proxy should not introduce or remove whitespace in header values beyond what HTTP allows

**Specs:** RFC 9110 §5.3 (field order), RFC 9112 §5 (field syntax)

### 14. URI handling

Tests: [test_request_forwarding.py](../conformance/tests/test_request_forwarding.py)

Request target must be preserved exactly:

- Path preserved (no normalization, no decoding of percent-encoding)
- Query string preserved
- Fragments should not appear in requests, but if they do, proxy behavior should be defined
- Empty path components, double slashes, dot segments — preserved, not normalized

**Specs:** RFC 9112 §3.2 (request target), RFC 9110 §7.1

### 15. Connection upgrades

Tests: [test_connection_upgrades.py](../conformance/tests/test_connection_upgrades.py)

WebSocket upgrades (101 Switching Protocols). The proxy must detect the upgrade, relay the 101 response, and switch to tunneling the raw TCP connection.

Tests cover:
- Successful WebSocket upgrade through the proxy
- Failed upgrade (server rejects with non-101 status)
- Bidirectional data flow after upgrade (text and binary)

h2c upgrades via the HTTP/1.1 Upgrade mechanism (RFC 9113 §3.2) are not tested separately — gRPC over h2c is covered in category 17.

**Specs:** RFC 9110 §7.8 (Upgrade), RFC 6455 (WebSockets)

### 16. Informational responses (1xx) other than 100

- **101 Switching Protocols**: Covered under Connection upgrades (category 15).
- **102 Processing** (WebDAV): Rarely used. Low priority. Forward if received.
- **103 Early Hints**: **Out of scope.** 103 is mainly used by CDNs (Cloudflare, Shopify) to send cached `Link` preload headers while the origin is still responding. Adoption outside CDN edge networks is minimal, and proxy support for forwarding upstream 103 responses is poor — Caddy and Nginx don't relay them, HAProxy can generate but not reliably forward them. Not a realistic development-proxy scenario.

**Specs:** RFC 9110 §15.2, RFC 8297 (103)

### 17. gRPC proxying (HTTP/2)

Tests: [test_grpc.py](../conformance/tests/test_grpc.py)

gRPC uses HTTP/2 (h2c in cleartext scenarios) for transport. The proxy must support h2c to the upstream, forward HTTP/2 frames correctly, and preserve gRPC-specific semantics including trailers (which carry gRPC status), streaming, and deadline propagation.

Tests cover:
- Unary RPC through the proxy
- Server streaming (multiple response messages)
- Bidirectional streaming (full-duplex message flow)
- gRPC error propagation via HTTP/2 trailers
- Large messages spanning multiple HTTP/2 DATA frames
- Deadline/timeout forwarding

**Specs:** gRPC over HTTP/2 Protocol, RFC 9113 (HTTP/2), RFC 9110 §7.8 (Upgrade)

## Out of scope

These HTTP features are not relevant for a transparent observation proxy:

- **CONNECT method**: Forward proxy tunneling, not reverse proxy behavior.
- **Max-Forwards** (RFC 9110 §7.6.2): Only applies to TRACE and OPTIONS. Irrelevant for a development tool.
- **TRACE method**: Proxies are supposed to handle TRACE specially, but it's widely disabled and irrelevant here.
- **Content negotiation**: The proxy doesn't interpret or act on Accept/Accept-* headers.
- **Caching behavior**: No caching. Cache headers are passthrough only (category 11).
- **Proxy authentication**: The proxy itself doesn't authenticate clients or upstreams. Proxy-Authenticate and Proxy-Authorization are hop-by-hop headers (category 3), though the RFC permits forwarding Proxy-Authorization (§11.7.1).
- **103 Early Hints**: Out of scope (see category 16).

## Detailed requirements

These catalog requirements will be noted in the test files, e.g. `catalog_ids=["5.3"]` or "§7.5" in doc comments.

### 1. Request forwarding fundamentals

#### 1.1 — Method preserved
**Spec:** RFC 9110 §9
**Description:** The proxy forwards the request method unchanged to the upstream. Test with GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD.
**Request:** Each method to a simple path
**Target expectation:** Method matches what the client sent
**Client expectation:** 200 (or 204 for OPTIONS/DELETE as appropriate)

#### 1.2 — Path preserved exactly
**Spec:** RFC 9112 §3.2
**Description:** The request path arrives at the upstream unchanged, including any path structure.
**Request:** GET /some/nested/path
**Target expectation:** Path is `/some/nested/path`
**Client expectation:** 200

#### 1.3 — Query string preserved
**Spec:** RFC 9112 §3.2
**Description:** Query string parameters are forwarded unchanged.
**Request:** GET /search?q=hello&page=2&sort=desc
**Target expectation:** Path+query is `/search?q=hello&page=2&sort=desc`
**Client expectation:** 200

#### 1.4 — Percent-encoding preserved
**Spec:** RFC 9112 §3.2
**Description:** Percent-encoded characters in the path and query are not decoded or double-encoded by the proxy.
**Request:** GET /path%20with%20spaces?q=hello%26world
**Target expectation:** Path+query is `/path%20with%20spaces?q=hello%26world`
**Client expectation:** 200

#### 1.5 — Request headers forwarded
**Spec:** RFC 9110 §7
**Description:** End-to-end request headers are forwarded intact (hop-by-hop handling is tested separately in category 3).
**Request:** GET / with headers `X-Custom-Header: custom-value`, `Accept: application/json`
**Target expectation:** Both headers present with original values
**Client expectation:** 200

#### 1.6 — Request body forwarded (Content-Length)
**Spec:** RFC 9112 §6.2
**Description:** A POST request body framed with Content-Length arrives at the upstream byte-for-byte.
**Request:** POST /data with Content-Length body `{"key": "value"}`
**Target expectation:** Body is `{"key": "value"}`, Content-Length matches
**Client expectation:** 200

#### 1.7 — Binary request body
**Spec:** RFC 9110 §8.6
**Description:** Proxy forwards binary request body without corruption. Sends a 1024-byte body containing all 256 byte values repeated 4 times.
**Request:** POST /echo with binary body (bytes 0x00–0xFF × 4)
**Target expectation:** Body matches what was sent byte-for-byte
**Client expectation:** 200

#### 1.8 — Empty body not fabricated
**Spec:** RFC 9110 §9.3.1
**Description:** For methods that typically have no body (GET, HEAD, DELETE), the proxy does not add a body or Content-Length: 0 where none was sent.
**Request:** GET / with no body, no Content-Length
**Target expectation:** No body received; Content-Length absent or zero
**Client expectation:** 200

#### 1.9 — Host header set to upstream authority
**Spec:** RFC 9110 §7.6.3
**Description:** The proxy MUST send a `Host` header matching the upstream server's authority (host:port), not the client's original `Host` value.
**Request:** GET /echo with `Host: test-host.example.com`
**Target expectation:** `host` header equals `{good_server.host}:{good_server.port}`
**Client expectation:** 200
**Note:** Checked via `CustomTargetExpectation` callback since the upstream port is assigned at runtime. HAProxy preserves the original Host by default (RFC deviation).

---

### 2. Response forwarding fundamentals

#### 2.1 — 2xx status forwarded
**Spec:** RFC 9110 §15.3
**Description:** Successful status codes are forwarded to the client unchanged.
**Request:** GET / (upstream returns 200)
**Target expectation:** Request received
**Client expectation:** 200

#### 2.2 — 3xx status and Location forwarded
**Spec:** RFC 9110 §15.4
**Description:** Redirect status codes and the Location header are forwarded unchanged.
**Request:** GET /redirect (upstream returns 301 with Location header)
**Target expectation:** Request received
**Client expectation:** 301 with original Location header value

_Note: Uses a GoodServer endpoint like `/redirect/301?to=/destination`._

#### 2.3 — 4xx status forwarded
**Spec:** RFC 9110 §15.5
**Description:** Client error status codes from upstream are forwarded, not intercepted by the proxy.
**Request:** GET /not-found (upstream returns 404)
**Target expectation:** Request received
**Client expectation:** 404

#### 2.4 — 5xx status forwarded
**Spec:** RFC 9110 §15.6
**Description:** Server error status codes from upstream are forwarded, not masked by the proxy.
**Request:** GET /error (upstream returns 503)
**Target expectation:** Request received
**Client expectation:** 503

#### 2.5 — Response headers forwarded
**Spec:** RFC 9110 §7
**Description:** End-to-end response headers from the upstream are forwarded to the client.
**Request:** GET / (upstream sends X-Custom-Response: value)
**Target expectation:** Request received
**Client expectation:** X-Custom-Response header present with original value

#### 2.6 — Response body forwarded (Content-Length)
**Spec:** RFC 9112 §6.2
**Description:** Response body framed with Content-Length is forwarded byte-for-byte.
**Request:** GET /body (upstream returns known body with Content-Length)
**Target expectation:** Request received
**Client expectation:** Body matches, Content-Length correct

#### 2.7 — Response body forwarded (chunked)
**Spec:** RFC 9112 §7.1
**Description:** Response body sent with chunked transfer encoding is forwarded intact. Proxy may re-frame.
**Request:** GET /chunked (upstream sends chunked response)
**Target expectation:** Request received
**Client expectation:** Body content matches what upstream sent

_Note: Tests 2.2–2.7 use GoodServer endpoints for configurable responses (e.g., `/status/503`, `/redirect/301`, `/headers?X-Custom-Response=value`). Tests 2.6 and 2.7 may need GoodServer endpoints that return specific body framing._

---

### 3. Hop-by-hop header handling

#### 3.1 — Connection header stripped from forwarded request
**Spec:** RFC 9110 §7.6.1
**Description:** The Connection header itself is not forwarded to the upstream.
**Request:** GET / with `Connection: keep-alive`
**Target expectation:** Connection header absent
**Client expectation:** 200

#### 3.2 — Connection-named headers stripped from forwarded request
**Spec:** RFC 9110 §7.6.1
**Description:** Headers listed in the Connection header's value are stripped from the forwarded request.
**Request:** GET / with `Connection: X-Custom-Hop`, `X-Custom-Hop: some-value`
**Target expectation:** Both Connection and X-Custom-Hop absent
**Client expectation:** 200

#### 3.3 — Keep-Alive stripped from forwarded request
**Spec:** RFC 9110 §7.6.1
**Description:** Keep-Alive is a hop-by-hop header and must not be forwarded.
**Request:** GET / with `Keep-Alive: timeout=5`
**Target expectation:** Keep-Alive absent
**Client expectation:** 200

#### 3.4 — TE header handling (findings-based)
**Spec:** RFC 9110 §7.6.1, §10.1.4
**Description:** §7.6.1 lists TE as hop-by-hop, but §10.1.4 explicitly permits forwarding `TE: trailers`. Neither Caddy nor HAProxy strips it. This test records whether the proxy strips or forwards the TE header — both behaviors are RFC-compliant.
**Request:** GET / with `TE: trailers`
**Target expectation:** TE may be present (forwarded) or absent (stripped)
**Client expectation:** 200

#### 3.5 — Proxy-Authorization handling (findings-based)
**Spec:** RFC 9110 §7.6.1, §11.7.1
**Description:** §7.6.1 lists Proxy-Authorization as hop-by-hop, but §11.7.1 permits relaying credentials to the next proxy. Neither Caddy nor HAProxy strips it. This test records whether the proxy strips or forwards the header — both behaviors are RFC-compliant.
**Request:** GET / with `Proxy-Authorization: Basic dGVzdDp0ZXN0`
**Target expectation:** Proxy-Authorization may be present (forwarded) or absent (stripped)
**Client expectation:** 200

#### 3.6 — Hop-by-hop headers stripped from forwarded response
**Spec:** RFC 9110 §7.6.1
**Description:** The proxy strips hop-by-hop headers from the upstream's response before forwarding to the client. Mirrors the request-direction tests.
**Request:** GET / (upstream response includes Connection, Keep-Alive, Proxy-Authenticate)
**Target expectation:** Request received
**Client expectation:** Connection, Keep-Alive, and Proxy-Authenticate absent from response

_Note: Uses GoodServer `/headers?Connection=keep-alive&Keep-Alive=timeout%3D5&Proxy-Authenticate=Basic` or similar endpoint for custom response headers._

#### 3.7 — End-to-end headers not stripped
**Spec:** RFC 9110 §7.6.1
**Description:** The proxy must not strip headers that are not hop-by-hop. Verify that arbitrary headers survive even if their names resemble internal headers.
**Request:** GET / with `X-Connection-Info: metadata`, `Authorization: Bearer token`
**Target expectation:** Both headers present with original values
**Client expectation:** 200

#### 3.8 — Upgrade header stripped when not acting on upgrade _(deferred)_
**Spec:** RFC 9110 §7.8
**Description:** The Upgrade header is hop-by-hop. When the proxy does not act on the upgrade (e.g., the request is a normal GET with a stale `Upgrade: h2c` header), the proxy must strip the Upgrade header from the forwarded request. When the proxy does act on the upgrade (e.g., WebSocket), it handles the Upgrade mechanism directly (see category 15).
**Request:** GET / with `Upgrade: h2c`
**Target expectation:** Upgrade header absent
**Client expectation:** 200

---

### 4. Via header

#### 4.1 — Via added to forwarded request
**Spec:** RFC 9110 §7.6.3
**Description:** The proxy adds a Via header to the forwarded request with the received protocol version and a proxy identifier.
**Request:** GET / (no Via header)
**Target expectation:** Via header present, contains "1.1" and a proxy identifier
**Client expectation:** 200

#### 4.2 — Via appended to existing Via in request
**Spec:** RFC 9110 §7.6.3
**Description:** When the incoming request already has a Via header, the proxy appends its own entry rather than replacing.
**Request:** GET / with `Via: 1.1 upstream-proxy`
**Target expectation:** Via header contains both "1.1 upstream-proxy" and the test proxy's entry
**Client expectation:** 200

#### 4.3 — Via added to forwarded response
**Spec:** RFC 9110 §7.6.3
**Description:** The proxy adds a Via header to the response forwarded to the client.
**Request:** GET / (upstream response has no Via)
**Target expectation:** Request received
**Client expectation:** Via header present in response

#### 4.4 — Via appended to existing Via in response
**Spec:** RFC 9110 §7.6.3
**Description:** When the upstream response already has a Via header, the proxy appends its own entry.
**Request:** GET / (upstream sends `Via: 1.1 backend`)
**Target expectation:** Request received
**Client expectation:** Via contains both "1.1 backend" and the proxy's entry

_Note: Tests 4.3 and 4.4 use GoodServer's `/headers` endpoint to set custom response headers (e.g., `/headers?Via=1.1+backend`)._

---

### 5. Forwarding identification headers

#### 5.1 — X-Forwarded-For added
**Spec:** [MDN: X-Forwarded-For](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For)
**Description:** The proxy adds X-Forwarded-For with the client's IP address.
**Request:** GET / (no X-Forwarded-For)
**Target expectation:** X-Forwarded-For present with an IP address (likely 127.0.0.1 in test)
**Client expectation:** 200

#### 5.2 — X-Forwarded-For appended to existing
**Spec:** [MDN: X-Forwarded-For](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For)
**Description:** When the request already has X-Forwarded-For, the proxy appends the client IP rather than replacing.
**Request:** GET / with `X-Forwarded-For: 10.0.0.1`
**Target expectation:** X-Forwarded-For contains "10.0.0.1" and an additional IP
**Client expectation:** 200

#### 5.3 — X-Forwarded-Proto added
**Spec:** [MDN: X-Forwarded-Proto](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Proto)
**Description:** The proxy adds X-Forwarded-Proto indicating the client's connection scheme.
**Request:** GET / over HTTP
**Target expectation:** X-Forwarded-Proto present with value "http"
**Client expectation:** 200

#### 5.4 — X-Forwarded-Host added
**Spec:** [MDN: X-Forwarded-Host](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Host)
**Description:** The proxy adds X-Forwarded-Host with the original Host header value.
**Request:** GET / with `Host: original.example.com`
**Target expectation:** X-Forwarded-Host present with value "original.example.com"
**Client expectation:** 200

#### 5.5 — X-Forwarded-Proto with existing value (findings-based)
**Spec:** [MDN: X-Forwarded-Proto](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Proto)
**Description:** When the client already sends X-Forwarded-Proto, the proxy may preserve, replace, or append. This test records observed behavior — all three approaches are seen in practice.
**Request:** GET / with `X-Forwarded-Proto: https`
**Target expectation:** X-Forwarded-Proto present; "https" may or may not be preserved
**Client expectation:** 200

#### 5.6 — X-Forwarded-Host with existing value (findings-based)
**Spec:** [MDN: X-Forwarded-Host](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Host)
**Description:** When the client already sends X-Forwarded-Host, the proxy may preserve, replace, or append. This test records observed behavior.
**Request:** GET / with `X-Forwarded-Host: previous.example.com`
**Target expectation:** X-Forwarded-Host present; "previous.example.com" may or may not be preserved
**Client expectation:** 200

---

### 6. Body framing

#### 6.1 — Content-Length request body
**Spec:** RFC 9112 §6.2
**Description:** Request body with Content-Length is forwarded intact. (Overlaps with 1.6; included here for completeness of the body framing category.)
**Request:** POST /data with 1000-byte body and matching Content-Length
**Target expectation:** Body is 1000 bytes, matches sent content
**Client expectation:** 200

#### 6.2 — Content-Length response body
**Spec:** RFC 9112 §6.2
**Description:** Response body with Content-Length is forwarded intact. (Overlaps with 2.6.)
**Request:** GET /body (upstream sends 1000-byte body with Content-Length: 1000)
**Target expectation:** Request received
**Client expectation:** Body is 1000 bytes, Content-Length: 1000

#### 6.3 — Chunked request body
**Spec:** RFC 9112 §7.1
**Description:** Chunked request body is forwarded with content intact. Proxy may re-frame. (Overlaps with 1.7.)
**Request:** POST /data with chunked body, multiple chunks
**Target expectation:** Body content matches
**Client expectation:** 200

#### 6.4 — Chunked response body
**Spec:** RFC 9112 §7.1
**Description:** Chunked response body is forwarded with content intact. Proxy may re-frame. (Overlaps with 2.7.)
**Request:** GET /chunked (upstream sends multi-chunk response)
**Target expectation:** Request received
**Client expectation:** Body content matches

#### 6.5 — HEAD response with Content-Length
**Spec:** RFC 9110 §9.3.2
**Description:** A HEAD response may include Content-Length (indicating what a GET would return) but must have no body. The proxy must not stall waiting for a body that will never arrive.
**Request:** HEAD / (upstream sends 200 with Content-Length: 5000 and no body)
**Target expectation:** HEAD request received
**Client expectation:** 200, Content-Length: 5000, empty body

#### 6.6 — Content-Length: 0
**Spec:** RFC 9112 §6.2
**Description:** A request or response with Content-Length: 0 is forwarded correctly — the proxy treats it as an explicit empty body, not as "no body."
**Request:** POST / with Content-Length: 0 and empty body
**Target expectation:** Content-Length: 0 present, body is empty
**Client expectation:** 200

#### 6.7 — Transfer-Encoding and Content-Length together rejected _(deferred)_
**Spec:** RFC 9112 §6.1
**Description:** A request that contains both Transfer-Encoding and Content-Length is a potential request smuggling vector. The proxy must reject such requests with 400 rather than forwarding them.
**Request:** POST / with both `Transfer-Encoding: chunked` and `Content-Length: 100`
**Target expectation:** No request forwarded
**Client expectation:** 400

#### 6.8 — Duplicate Content-Length rejected _(deferred)_
**Spec:** RFC 9110 §8.6
**Description:** A request with multiple Content-Length headers carrying different values is malformed and must be rejected to prevent request smuggling.
**Request:** POST / with two `Content-Length` headers with different values
**Target expectation:** No request forwarded
**Client expectation:** 400

---

### 7. Chunked encoding edge cases

#### 7.1 — Request trailers forwarded
**Spec:** RFC 9112 §7.1.2, RFC 9110 §6.5
**Description:** Trailer fields in a chunked request are forwarded to the upstream. Important for gRPC and similar protocols.
**Request:** POST /trailers with chunked body followed by `X-Checksum: abc123` trailer
**Target expectation:** X-Checksum trailer present with value "abc123"
**Client expectation:** 200

#### 7.2 — Response trailers forwarded
**Spec:** RFC 9112 §7.1.2, RFC 9110 §6.5
**Description:** Trailer fields in a chunked response from the upstream are forwarded to the client.
**Request:** GET /trailers (upstream sends chunked response with trailers)
**Target expectation:** Request received
**Client expectation:** Trailer fields present

#### 7.3 — Missing final chunk in request (client-side error)
**Spec:** RFC 9112 §7.1
**Description:** Client sends a chunked request but closes the connection without the final zero-length chunk. The proxy should detect this as a malformed request.
**Request:** (h11 client) POST /incomplete with chunked body, omit final chunk, close connection
**Target expectation:** Depends on proxy — may or may not receive a partial request
**Client expectation:** Error status. Protospy: 400. Caddy: 502 (streams to upstream, which rejects). See proxy-specific expectations infrastructure note.

#### 7.4 — Missing final chunk in response (upstream-side error)
**Spec:** RFC 9112 §7.1
**Description:** Upstream sends a chunked response but closes the connection without the final zero-length chunk. The proxy should detect this and return an error to the client.
**Request:** GET /truncated (BadServer sends chunked response without final chunk)
**Target expectation:** Request received
**Client expectation:** 502 Bad Gateway

#### 7.5 — Invalid chunk size in request
**Spec:** RFC 9112 §7.1
**Description:** Client sends a chunked request with an invalid (non-hex) chunk size.
**Request:** (h11 client) POST / with chunk framing containing "ZZZZ\r\n" as chunk size
**Target expectation:** No request forwarded
**Client expectation:** 400

#### 7.6 — Invalid chunk size in response
**Spec:** RFC 9112 §7.1
**Description:** Upstream sends a chunked response with an invalid chunk size.
**Request:** GET / (BadServer sends response with invalid chunk size)
**Target expectation:** Request received
**Client expectation:** 502

#### 7.7 — Trailer header announces trailers
**Spec:** RFC 9110 §6.5.1
**Description:** When a chunked message includes a Trailer header field listing the trailer names, the proxy forwards the Trailer header and the corresponding trailer fields.
**Request:** POST / with `Trailer: X-Checksum`, chunked body, X-Checksum trailer
**Target expectation:** Trailer header and X-Checksum trailer both present
**Client expectation:** 200

---

### 8. 100-continue

All tests in this category require the h11 client (for precise control over when the body is sent). The target server behavior needs to be controlled via BadServer handlers (for 8.2 and 8.3) or GoodServer (for the basic flow).

#### 8.1 — Basic 100-continue flow
**Spec:** RFC 9110 §10.1.1, RFC 9112 §9.3
**Description:** Client sends Expect: 100-continue. Proxy forwards to upstream. Upstream sends 100 Continue. Proxy relays 100 to client. Client sends body. Proxy forwards body. Upstream sends final response.
**Request:** POST / with `Expect: 100-continue` and body (h11 client, wait for 100 before sending body)
**Target expectation:** Expect header seen, request body received
**Client expectation:** 100 Continue received before final 200

#### 8.2 — Upstream ignores Expect, sends final response
**Spec:** RFC 9110 §10.1.1
**Description:** Upstream doesn't send 100 and instead sends the final response directly. The proxy should forward the final response; the client should still send the body.
**Request:** POST / with `Expect: 100-continue` (BadServer skips 100, sends 200 immediately)
**Target expectation:** Request received
**Client expectation:** 200 (no 100 received)

#### 8.3 — Upstream rejects with 417
**Spec:** RFC 9110 §15.5.18
**Description:** Upstream rejects the expectation with 417 Expectation Failed. Proxy forwards 417 to client. Body should not be sent or forwarded.
**Request:** POST / with `Expect: 100-continue` (BadServer sends 417)
**Target expectation:** Received request headers only (no body)
**Client expectation:** 417

#### 8.4 — Client sends body without waiting for 100
**Spec:** RFC 9112 §9.3
**Description:** Client sends Expect: 100-continue but immediately sends the body anyway (allowed by the spec — the Expect mechanism is advisory). Proxy should handle gracefully.
**Request:** POST / with `Expect: 100-continue`, body sent immediately without waiting
**Target expectation:** Body received
**Client expectation:** 200

---

### 9. Error responses

#### 9.1 — Upstream unreachable (connection refused)
**Spec:** RFC 9110 §15.6.3
**Description:** Upstream server is not listening. Proxy returns 502 Bad Gateway.
**Request:** GET / (proxy configured to forward to a port where nothing is listening)
**Target expectation:** N/A (no server)
**Client expectation:** 502

#### 9.2 — Upstream sends malformed response
**Spec:** RFC 9110 §15.6.3
**Description:** Upstream sends data that is not valid HTTP (garbage bytes after connection).
**Request:** GET / (BadServer sends non-HTTP data)
**Target expectation:** Request received
**Client expectation:** 502

#### 9.3 — Upstream drops connection after headers
**Spec:** RFC 9110 §15.6.3
**Description:** Upstream sends response headers but closes the connection before sending the body (Content-Length promised more data).
**Request:** GET / (BadServer sends headers with Content-Length: 1000, then closes)
**Target expectation:** Request received
**Client expectation:** 502, or partial response with connection close (proxy-dependent)

#### 9.4 — Upstream drops connection before any response
**Spec:** RFC 9110 §15.6.3
**Description:** Upstream accepts the connection, receives the request, but closes without sending anything.
**Request:** GET / (BadServer accepts, reads request, closes socket)
**Target expectation:** Request received
**Client expectation:** 502

#### 9.5 — Upstream Content-Length mismatch
**Spec:** RFC 9112 §6.2
**Description:** Upstream sends a response with Content-Length: 1000 but only sends 500 bytes before the final chunk/close.
**Request:** GET / (BadServer sends short body)
**Target expectation:** Request received
**Client expectation:** 502, or truncated body with connection close

---

### 10. Timeouts

These tests use the BadServer with handlers that stall at specific points. Timeout values used in the proxy configuration should be short (1–2 seconds) to keep tests fast. The test assertions need to account for timing variance.

#### 10.1 — Upstream connection timeout
**Spec:** RFC 9110 §15.6.5
**Description:** Upstream host exists but doesn't complete the TCP handshake (e.g., packets are dropped, not refused).
**Request:** GET / (proxy configured to connect to a black-hole address or a firewall-dropped port)
**Target expectation:** N/A
**Client expectation:** 504 Gateway Timeout

_Note: Simulating a true connection timeout in a test environment is tricky. Options: use a non-routable IP like 192.0.2.1, or bind a socket but never accept. This may need experimentation._

#### 10.2 — Upstream response header timeout
**Spec:** RFC 9110 §15.6.5
**Description:** Upstream accepts the connection and receives the request, but never sends response headers.
**Request:** GET / (BadServer accepts, reads request, sleeps indefinitely)
**Target expectation:** Request received
**Client expectation:** 504 Gateway Timeout

#### 10.3 — Upstream response body stall
**Spec:** RFC 9110 §15.6.3
**Description:** Upstream sends response headers and partial body, then stalls.
**Request:** GET / (BadServer sends headers + partial body, then sleeps)
**Target expectation:** Request received
**Client expectation:** 502 or truncated response with connection close

#### 10.4 — Client request body stall
**Spec:** RFC 9110 §15.5.9
**Description:** Client sends request headers indicating a body, then stalls without sending the body.
**Request:** (h11 client) POST / with Content-Length: 1000, send headers only, then stall
**Target expectation:** Proxy may or may not forward the headers before the body arrives
**Client expectation:** 408 Request Timeout or connection close

#### 10.5 — Idle connection timeout
**Spec:** (implementation-specific)
**Description:** A keep-alive connection sits idle beyond the proxy's idle timeout. The proxy closes it.
**Request:** Send a request, receive the response, then hold the connection open without sending another request.
**Target expectation:** N/A
**Client expectation:** Connection closed by proxy after idle timeout

---

### 11. Cache header passthrough

Since protospy is non-caching, these headers must pass through unmodified in both directions. Tested as a parametrized group — same test logic, different header names and values.

#### 11.1 — Cache headers in responses forwarded unchanged
**Spec:** RFC 9111
**Description:** The following upstream response headers are forwarded to the client without modification:

| Header | Example value |
|--------|---------------|
| Cache-Control | max-age=3600, public |
| Expires | Thu, 01 Dec 2025 16:00:00 GMT |
| ETag | "abc123" |
| Last-Modified | Wed, 21 Oct 2025 07:28:00 GMT |
| Age | 600 |
| Vary | Accept-Encoding |
| Pragma | no-cache |

**Request:** GET / (upstream sends each header)
**Target expectation:** Request received
**Client expectation:** Each header present with exact original value

#### 11.2 — Cache headers in requests forwarded unchanged
**Spec:** RFC 9111
**Description:** Cache-related request headers (If-None-Match, If-Modified-Since, Cache-Control) are forwarded to the upstream without modification.
**Request:** GET / with `If-None-Match: "abc123"`, `Cache-Control: no-cache`
**Target expectation:** Both headers present with original values
**Client expectation:** 200

---

### 12. Content header passthrough

#### 12.1 — Content headers in responses forwarded unchanged
**Spec:** RFC 9110 §8
**Description:** Content-related response headers pass through without modification. Parametrized:

| Header | Example value |
|--------|---------------|
| Content-Type | application/json; charset=utf-8 |
| Content-Encoding | gzip |
| Content-Language | en-US |
| Content-Disposition | attachment; filename="data.csv" |
| Content-Range | bytes 0-499/1000 |

**Request:** GET / (upstream sends each header)
**Target expectation:** Request received
**Client expectation:** Each header present with exact original value

#### 12.2 — Content-Encoding not altered
**Spec:** RFC 9110 §8.4
**Description:** The proxy does not decompress or recompress response bodies. A gzip-encoded response passes through with Content-Encoding: gzip intact.
**Request:** GET / with `Accept-Encoding: gzip` (upstream sends gzip body with Content-Encoding: gzip)
**Target expectation:** Request received
**Client expectation:** Content-Encoding: gzip, body is gzip-compressed bytes (not decompressed)

---

### 13. Header preservation details

#### 13.1 — Multiple values for same header preserved
**Spec:** RFC 9110 §5.3
**Description:** When a request contains multiple values for the same header (either comma-separated or as separate header lines), all values are forwarded.
**Request:** GET / with `Accept: text/html`, `Accept: application/json` (two separate header lines)
**Target expectation:** Both Accept values present
**Client expectation:** 200

#### 13.2 — Set-Cookie headers preserved separately
**Spec:** RFC 9110 §5.3
**Description:** Set-Cookie is special — multiple Set-Cookie headers must not be combined into a single comma-separated line (unlike other headers). The proxy must preserve them as separate headers.
**Request:** GET / (upstream sends two separate Set-Cookie headers)
**Target expectation:** Request received
**Client expectation:** Two separate Set-Cookie headers in response, not combined

#### 13.3 — Header value whitespace preserved
**Spec:** RFC 9112 §5
**Description:** The proxy does not introduce or remove significant whitespace in header values.
**Request:** GET / with `X-Spaced: value  with   spaces`
**Target expectation:** X-Spaced value is `value  with   spaces`
**Client expectation:** 200

---

### 14. URI handling

#### 14.1 — Double slashes preserved
**Spec:** RFC 9112 §3.2
**Description:** Double slashes in the path are not normalized away.
**Request:** GET //double//slashes
**Target expectation:** Path is `//double//slashes`
**Client expectation:** 200

#### 14.2 — Dot segments preserved
**Spec:** RFC 9112 §3.2
**Description:** The proxy does not resolve `.` or `..` segments in the path. (Proxies forward the request-target as-is; resolution is the origin server's responsibility.)
**Request:** GET /a/../b/./c
**Target expectation:** Path is `/a/../b/./c`
**Client expectation:** 200

#### 14.3 — Empty query string preserved
**Spec:** RFC 9112 §3.2
**Description:** A path with `?` but no query parameters is distinct from a path with no `?`.
**Request:** GET /path?
**Target expectation:** Path+query is `/path?`
**Client expectation:** 200

#### 14.4 — Fragment not forwarded
**Spec:** RFC 9112 §3.2
**Description:** Fragments (#) should not appear in HTTP request-targets. If the proxy receives one (e.g., from a misconfigured client), it should either strip it or reject the request — not forward it to the upstream.
**Request:** (h11 client) GET /path#fragment
**Target expectation:** Path does not contain `#fragment`
**Client expectation:** 200 or 400

---

### 15. Connection upgrades

#### 15.1 — Successful WebSocket upgrade
**Spec:** RFC 6455, RFC 9110 §7.8
**Description:** Proxy relays the WebSocket upgrade handshake (101 Switching Protocols) and tunnels the resulting connection. Client sends a message through the proxy to a WebSocket echo server and receives it back.
**Request:** WebSocket connect to /ws/echo, send text message
**Target expectation:** WebSocket upgrade accepted, message echoed
**Client expectation:** Echoed message matches sent message

#### 15.2 — Failed WebSocket upgrade
**Spec:** RFC 6455, RFC 9110 §7.8
**Description:** When the upstream rejects a WebSocket upgrade (returns non-101 status), the proxy forwards the rejection to the client rather than generating its own error.
**Request:** GET /ws/reject (with or without Upgrade headers)
**Target expectation:** Returns 403
**Client expectation:** Receives 403 (not 502 or 504)

#### 15.3 — Bidirectional data flow after upgrade
**Spec:** RFC 6455
**Description:** After a successful WebSocket upgrade, the proxy tunnels data bidirectionally. Multiple text and binary messages are sent and echoed to verify sustained tunneling.
**Request:** WebSocket connect to /ws/echo, send multiple text and binary messages
**Target expectation:** All messages echoed
**Client expectation:** All echoed messages match sent messages

---

### 16. Informational responses (1xx) other than 100

#### 16.1 — 102 Processing forwarded
**Spec:** RFC 9110 §15.2.3
**Description:** If the upstream sends 102 Processing (WebDAV), the proxy forwards it to the client.
**Request:** GET / (BadServer sends 102, then 200)
**Target expectation:** Request received
**Client expectation:** 102 received before 200

_Low priority. Include if straightforward to test._

---

### 17. gRPC proxying (HTTP/2)

#### 17.1 — Unary echo
**Spec:** gRPC over HTTP/2
**Description:** A unary gRPC call (single request, single response) is proxied correctly. The proxy forwards the HTTP/2 HEADERS and DATA frames, and the gRPC response including trailers arrives intact.
**Request:** UnaryEcho RPC with text message
**Target expectation:** Receives the RPC, echoes message back
**Client expectation:** Receives echoed message with grpc-status OK

#### 17.2 — Server streaming
**Spec:** gRPC over HTTP/2
**Description:** A server-streaming RPC sends multiple response messages. The proxy forwards each HTTP/2 DATA frame as it arrives.
**Request:** ServerStream RPC with count=10
**Target expectation:** Yields 10 responses with incrementing sequence
**Client expectation:** Receives all 10 messages in order with correct sequences

#### 17.3 — Bidirectional streaming
**Spec:** gRPC over HTTP/2
**Description:** A bidirectional streaming RPC sends and receives messages concurrently. The proxy tunnels the full-duplex HTTP/2 stream.
**Request:** BidiStream RPC, send 5 messages
**Target expectation:** Echoes each message as received
**Client expectation:** Receives 5 echoed responses matching sent messages

#### 17.4 — gRPC error propagation
**Spec:** gRPC over HTTP/2
**Description:** When the gRPC server returns an error status (via HTTP/2 trailers), the proxy forwards the trailers intact so the client receives the correct gRPC status code and message.
**Request:** UnaryEcho RPC with sentinel message triggering INVALID_ARGUMENT
**Target expectation:** Aborts with INVALID_ARGUMENT status
**Client expectation:** Receives INVALID_ARGUMENT with error message

#### 17.5 — Large message
**Spec:** gRPC over HTTP/2
**Description:** A gRPC message large enough to span multiple HTTP/2 DATA frames (~1 MB) is forwarded correctly without truncation or corruption.
**Request:** UnaryEcho RPC with 1 MB payload
**Target expectation:** Receives full payload, echoes it back
**Client expectation:** Receives identical 1 MB payload

#### 17.6 — Deadline/timeout forwarding
**Spec:** gRPC over HTTP/2
**Description:** gRPC deadline metadata (grpc-timeout header) is forwarded through the proxy. A short deadline with a slow upstream results in DEADLINE_EXCEEDED at the client. Findings-based — proxy behavior varies.
**Request:** UnaryEcho RPC with 0.5s timeout, upstream sleeps 3s
**Target expectation:** May or may not receive the RPC (depends on proxy timeout handling)
**Client expectation:** Receives DEADLINE_EXCEEDED

---

## 18. HTTP/1.1 → HTTP/2 bridging

Tests: [test_h2_bridging.py](../conformance/tests/test_h2_bridging.py)

When a proxy receives an HTTP/1.1 request and forwards it to an h2c upstream, it must translate protocol-specific framing: the `Host` header becomes `:authority`, `Transfer-Encoding: chunked` must be stripped (HTTP/2 handles framing at the protocol layer), and the request method and path become `:method` and `:path` pseudo-headers.

**Scope:** H1.1 client → proxy → h2c upstream only.

#### 18.1 — Host translated to :authority
**Spec:** RFC 7540 §8.1.2.3
**Description:** When bridging an HTTP/1.1 request to an HTTP/2 upstream, the proxy sets the `:authority` pseudo-header from the incoming `Host` header.
**Request:** GET / with `Host: example.com`
**Target expectation:** `:authority` pseudo-header is `example.com` on the h2c upstream
**Client expectation:** 200 OK

#### 18.2 — Transfer-Encoding stripped on h2c upstream
**Spec:** RFC 7540 §8.1.2.2
**Description:** HTTP/2 does not use `Transfer-Encoding` for framing. When bridging a chunked HTTP/1.1 request to an h2c upstream, the proxy must strip the `Transfer-Encoding` header. The body itself must arrive intact.
**Request:** POST / with chunked body
**Target expectation:** Body arrives at the correct length; `transfer-encoding` header is absent on the upstream
**Client expectation:** 200 OK

#### 18.3 — Method and path preserved as pseudo-headers
**Spec:** RFC 7540 §8.1.2.3
**Description:** The HTTP/1.1 request method and path are forwarded as `:method` and `:path` pseudo-headers in the HTTP/2 request.
**Request:** POST /foo/bar with a small body
**Target expectation:** `:method` is `POST`, `:path` is `/foo/bar` on the h2c upstream
**Client expectation:** 200 OK

## 19. Streaming response behavior

Tests: [test_streaming.py](../conformance/tests/test_streaming.py)

Verifies that the proxy forwards response chunks incrementally as they arrive from upstream rather than buffering the full response, and that it propagates client disconnects to the upstream connection.

Tests use a deterministic gating mechanism: the upstream handler sends a chunk then blocks on a `threading.Event`; the client sets the event after receiving the chunk, unblocking the handler. A buffering proxy causes the client read to time out because the response never completes (the handler waits for a gate only the client can set, and the client never gets any data to trigger the gate).

#### 19.1 — Proxy does not buffer chunked streaming responses
**Spec:** RFC 9112 §7.1 (chunked transfer encoding), RFC 9110 §7.6.1 (hop-by-hop)
**Description:** A proxy must forward each chunk to the client as soon as it is received from upstream. Buffering the full response before forwarding breaks streaming use cases (SSE, long downloads, chunked APIs).
**Request:** GET to an upstream that sends 3 chunks sequentially, each gated on the client acknowledging the previous chunk
**Target expectation:** Each chunk is forwarded promptly; the client receives chunk N before chunk N+1 is sent
**Client expectation:** 200 OK; body matches concatenation of all chunks

#### 19.2 — Client disconnect closes upstream connection
**Spec:** RFC 9110 §9.6 (tear-down)
**Description:** When the client disconnects while reading a streaming response, the proxy must close the upstream connection rather than leaking it.
**Request:** GET to a gated streaming upstream; client reads the first chunk and disconnects
**Target expectation:** The upstream connection is closed (next upstream send fails with OSError)
**Client expectation:** Connection closed mid-stream
