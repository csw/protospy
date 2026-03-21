# Conformance Test Suite Design Notes

Notes and decisions from the PoC review and subsequent design discussions. These should inform the full conformance suite spec.

## Architecture refinements

### Target server naming

- **GoodServer** (was "echo server" in the PoC): A well-behaved HTTP server built on aiohttp. Provides multiple endpoints for different test needs: `/echo` (returns request details as JSON), `/status/{code}`, `/redirect/{code}?to={url}`, `/headers?X-Custom=value` (sends custom response headers), etc. Handles all the "server behaves correctly, we're testing the proxy" scenarios.
- **WireServer** (was "h11 server" in the PoC): A programmable server built on h11/raw sockets with full wire-level visibility. Serves dual roles: protocol-transparent target for observing exactly what the proxy sends, and programmable misbehavior server for edge-case testing (truncated bodies, malformed chunks, stalls, garbage responses).

### Dual-upstream proxy model

The proxy under test listens on two ports, each forwarding to a different target:
- Port A → GoodServer (aiohttp, standard HTTP behavior)
- Port B → WireServer (h11, programmable misbehavior)

This avoids path-based dispatch and keeps the proxy config simple. Both Caddy and protospy would support this. Each target server can also run standalone for ad hoc experimentation.

### Standalone target servers

Both GoodServer and WireServer should be runnable outside the test context, on fixed ports, from the command line. This supports:
- Ad hoc requests with curl through the proxy
- Observation and experimentation during development
- Running a single failing test against an externally-started proxy with a debugger

GoodServer already has this. WireServer should have it too, with a default handler (or a CLI flag to select a scenario).

### External proxy mode for debugging

CLI options for running tests against a separately-started proxy:
- `--proxy-url http://localhost:XXXX` — skip proxy lifecycle, use this URL
- `--good-target-port N` — fix the GoodServer port
- `--wire-target-port N` — fix the WireServer port

When `--proxy-url` is provided, the proxy fixture becomes a passthrough. The user is responsible for starting the proxy and configuring it to forward to the target server ports.

Workflow for debugging a failing test:
1. Start GoodServer on port 9000 (standalone)
2. Start protospy with debugger, configured to proxy to localhost:9000
3. `uv run pytest tests/test_basic_proxy.py::test_basic_proxy[via-header-added] --proxy-url http://localhost:8080 --good-target-port 9000`

### Test name in path info

Prepend `/test/{case.id}/` to request paths. This makes proxy logs, tcpdump, and Wireshark captures self-documenting. The GoodServer ignores this prefix (it captures the full path regardless). Cheap to implement, high value for debugging.

## Changes from PoC for full suite

### Naming

- `rfc_ref` → `spec_ref`: Accommodates non-RFC specifications like X-Forwarded-For and X-Forwarded-Proto.

### Header representation

Unify all header representations to `dict[str, list[str]]` with lowercase keys. The PoC's `RawResponse.headers` uses `dict[str, str]` (last-value-wins), which will break for multi-valued headers like Set-Cookie. Fix this in the h11 client's `_parse_raw_response` before writing more tests.

### Logging and reporting

Replace `print("  [info] ...")` with structured logging. Distinguish between:
- **Expected informational observations**: "Caddy returned 502 for incomplete chunked request" — behavioral documentation
- **Unexpected findings**: things that might indicate a test infrastructure problem

Consider a dedicated collection mechanism for behavioral observations that produces a summary at the end of the test run, rather than interleaving with pytest output.

### Assertion types needed for full suite

From the PoC review, the current `HeaderExpectation` (present/contains/absent) needs:
- **Header value count**: "target should see exactly 1 Host header" (for header merging/splitting)
- **Status range**: `status >= 400` as a declarative field, not manual assertion
- **Response body assertions**: `ClientExpectation` currently has no body field
- **Negative target assertion**: "target should NOT have received a request" (proxy rejects before forwarding)
- **Body length without content match**: for cases where re-chunking changes exact bytes but preserves length

### Proxy fixture

- Pre-parse the proxy URL rather than parsing it in every test
- Use try/finally in proxy lifecycle cleanup (Caddy termination, GoodServer stop)
- Temp Caddyfile cleanup (currently `delete=False` with no cleanup)
- Consider Caddy JSON config instead of Caddyfile for programmatic generation

### Proxy lifecycle abstraction

The `proxy_url` fixture currently has a conditional branch for Caddy. Before adding protospy as a second proxy, consider whether the fixture needs restructuring. A simple approach: one start function per proxy type, each returning a URL and a cleanup callable. Avoid over-abstracting with ABCs unless the interface genuinely varies.

## Scope decisions for full suite

### What's probably not needed

- **Caddy access log capture**: Client-side + target-side observation should suffice. Proxy logs are useful for debugging the test infrastructure, but stderr from the proxy subprocess handles that.
- **curl as a test client**: The h11 client covers fine-grained protocol control. curl's `--expect100-timeout` etc. can be replicated with h11. curl remains useful for ad hoc experimentation outside the test suite, but doesn't need to be integrated into pytest.
- **Full RFC test coverage**: The suite should cover proxy-relevant functionality — header forwarding, hop-by-hop handling, body forwarding, error responses, Via, X-Forwarded-For — not every HTTP feature. Things like content negotiation are irrelevant for a transparent observation proxy.

### What's needed but deferred

- 100-continue handling (needs WireServer with delayed 100 support)
- Trailers
- Response header passthrough testing (needs configurable response headers on the GoodServer)
- De facto standards: X-Forwarded-For, X-Forwarded-Proto, X-Forwarded-Host
- CI integration

### Body handling philosophy

The proxy should transparently propagate request and response bodies regardless of method. Don't special-case OPTIONS, HEAD, etc. for body presence — just forward what's there. The tests should verify this passthrough behavior rather than testing HTTP method semantics.

## Parallelism

Not a priority. Tests are fast and the complexity of correlating concurrent requests with test cases (via correlation IDs in headers or path info) isn't worth it until the suite is large enough that sequential execution is a problem. If it becomes needed, the test-name-in-path-info pattern provides a natural correlation mechanism.
