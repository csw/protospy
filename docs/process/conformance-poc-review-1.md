## PoC Review

### 1. Echo server pattern

**Verdict: Strong. Ready for the full suite.**

- The JSON echo body is useful for debugging — method, path, headers, and base64-encoded body give full visibility. The base64 encoding for body is the right call (avoids encoding ambiguity).
- Out-of-band `last_request()` works reliably across GET, POST, and HEAD. The HEAD case elegantly demonstrates why this pattern matters — you can't inspect the request via the response body.
- The queue-based capture is clean. No race conditions observed, and the `_clear_echo_requests` autouse fixture prevents cross-test pollution.
- One concern: **the queue has no ordering guarantee relative to response delivery**. The request is enqueued *before* the response is sent (line 145 in echo_server.py), which is fine for correctness, but if a test ever needs to correlate "proxy got this response" with "target saw this request," there's a subtle ordering assumption. Not a problem today, but worth noting for the full suite.

**Minor nit:** `_find_free_port()` is duplicated in both `echo_server.py` and `conftest.py`. Not worth fixing in a PoC, but for the full suite, consolidate it.

### 2. h11 client integration

**Verdict: Effective for the purpose. Maintainability is the main concern.**

- h11 was an excellent choice for the chunked request test. Using it for framing while deliberately skipping `EndOfMessage` is exactly the right level of control — you get correct HTTP up to the point of violation.
- The manual response parser (`_parse_raw_response`) is adequate for the PoC. It handles the happy path fine. For the full suite, it will need to handle: chunked responses, multi-valued headers (currently last-wins in `dict[str, str]`), missing status reasons, and potentially malformed responses from the proxy itself.
- The socket-level code is surprisingly clean for what it does. The `SHUT_WR` trick to signal "client is done writing" without closing the read side is correct and well-commented.
- **The `RawResponse.headers` is `dict[str, str]` while everything else uses `dict[str, list[str]]`**. This inconsistency will bite when you test response headers that appear multiple times (e.g., `Set-Cookie`). Should be unified for the full suite.

**Key finding well-documented:** The Caddy 502 vs. expected 400 for incomplete chunked requests is exactly the kind of behavioral observation this PoC was designed to surface. The test correctly documents this without asserting the wrong thing.

### 3. Proxy swapping

**Verdict: The mechanism works, but needs adjustment before adding protospy.**

- The `--proxy` CLI option is clear. The `proxy_url` fixture is the single point of proxy lifecycle management — good.
- **Adding protospy would require:** another `elif` branch in `proxy_url`, a function like `_start_protospy(echo_url, proxy_port)`, and that's about it. The interface is clean — every proxy just needs to produce a URL and a way to shut down.
- Caddy startup/shutdown is reliable. The Caddyfile-via-tempfile approach works, and the error handling on startup failure (read stderr, report) is practical.
- **One concern:** The temp Caddyfile is created with `delete=False` but never cleaned up. For a PoC this is fine; for the full suite, either use `delete_on_close=False` with explicit cleanup in the fixture teardown, or use a pytest `tmp_path_factory` (session-scoped).
- **Bigger concern for extensibility:** The proxy lifecycle is currently a generator-based fixture. If different proxies need different configuration (e.g., protospy might need different config flags, or might not use a config file at all), the `proxy_url` fixture could get unwieldy. Consider a small `ProxyManager` protocol/ABC with `start(echo_url) -> url` and `stop()` methods. This is the one structural change I'd recommend before scaling. [Clayton: I'm not sold on this; a generator fixture will be clearer, and can use a stop method if necessary.]

### 4. Test data structure

**Verdict: The dataclasses are well-designed. A few gaps for the full suite.**

- `ProxyTestCase` is readable. The test output with `ids=lambda c: c.id` produces clean `test_basic_proxy[get-simple]` style names — easy to identify failures.
- `HeaderExpectation` with present/contains/absent covers the PoC cases well.
- **Missing assertion types for the full suite:**
  - **Header value count**: "target should see exactly 1 `Host` header" (important for header merging/splitting tests)
  - **Body length without content match**: for cases where you care the body was forwarded but not the exact bytes (e.g., after re-chunking)
  - **Status range**: `test_proxy_returns_error` manually checks for 4xx/5xx — a `status_range` or `status_in` field on `ClientExpectation` would be useful
  - **Response body assertions**: `ClientExpectation` has no body field — needed once you test response body passthrough
  - **Negative target assertion**: "target should NOT have received a request" (for cases where the proxy should reject before forwarding)
- The `rfc_ref` field is a nice touch for traceability. Consider whether you want structured RFC references (for generating a coverage matrix later) vs. freeform strings.

### Observations recorded

The PoC successfully surfaced:
- Caddy adds `Via: 1.1 Caddy` — including the proxy identity, with HTTP/1.1 as the protocol version on the upstream hop.
- Caddy strips `Keep-Alive` but the test doesn't check whether `Connection` itself is stripped from the forwarded request (it only checks `Keep-Alive` in `absent`)
- Caddy returns **502** (not 400) for incomplete chunked requests — it streams to the target, the target rejects, and Caddy surfaces the upstream failure. This is a meaningful behavioral difference worth testing across proxies.

### Overall assessment

This is a well-executed PoC. The architecture (three-tier client/proxy/echo, out-of-band capture, declarative test cases, pluggable proxy) is sound and ready to scale. The code is clean, well-commented where it matters, and the tests run fast and reliably.

**Top 3 recommendations for the full suite:**
1. Unify header representations — `RawResponse.headers` should be `dict[str, list[str]]` like everything else
2. Extract proxy lifecycle into a protocol/ABC before adding protospy as a second proxy
3. Add the missing assertion types (header count, status range, negative target assertions) to the dataclasses before writing the full test catalog
