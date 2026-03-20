# BadServer PoC Plan

## Goal

Validate the design for a programmable target server ("BadServer") that can simulate protocol-level edge cases (truncated bodies, malformed chunked responses, delayed 100-continue, etc.) and integrate cleanly with the existing conformance test architecture.

## Context

The GoodServer PoC validated the happy-path testing architecture: httpx client, proxy under test, aiohttp GoodServer as target. That pattern works well when the target server should behave correctly. For tests where the target must misbehave — send fewer bytes than Content-Length promises, produce invalid chunk framing, delay a 100 response — we need a second target server ("BadServer") built on h11 that gives tests full control over the bytes on the wire.

This server runs independently alongside the GoodServer on a separate port. The proxy is configured with two upstreams (one per target server), each on its own listening port. This avoids path-based dispatch and keeps the proxy configuration simple.

## Design

### Handler-per-test pattern

The BadServer is a generic TCP listener. Its behavior for each test is determined by a **handler**: a callable that receives the parsed request and the raw socket, and is responsible for sending the response (or misbehaving in whatever way the test requires).

The server:
1. Accepts a TCP connection
2. Reads the request using h11 (giving the handler a parsed `h11.Request` and any `h11.Data`)
3. Calls the current handler, passing it the request info and the socket
4. The handler sends whatever it wants — valid HTTP, truncated HTTP, garbage bytes, nothing

The test sets the handler before sending its request through the proxy:

```
test sets handler → test sends request to proxy → proxy forwards to BadServer →
BadServer calls handler → handler sends (mis)response → proxy relays to client →
test asserts on what it received
```

### Common handler helpers

For frequently-needed scenarios, provide factory functions that return handlers:

- **`truncated_body(status, headers, promised_length, actual_bytes)`**: Sends response headers with the given Content-Length, writes only `actual_bytes` bytes of body, then closes the connection.
- **`malformed_chunks(status, headers, chunks)`**: Sends chunked response where `chunks` is a list of raw byte sequences — the test can include valid chunks, invalid length fields, missing CRLFs, or omit the terminal chunk.
- **`delayed_100(delay_seconds)`**: For 100-continue testing. Waits before sending the 100 Continue interim response.
- **`connection_refused()`** (or similar): Doesn't even accept the connection, or accepts and immediately closes. For 502 testing.

Tests that need truly custom behavior just provide their own handler function.

### Server lifecycle

The BadServer class should support:

- **In-test use** (function-scoped fixture): start on a dynamic port, set handler, run one request, stop. Used for automated test runs.
- **Standalone use**: start on a fixed port from the command line, with a default handler (e.g., echo-like behavior or a specific scenario). Used for ad hoc experimentation with curl.

The standalone mode is important for debugging — you start the BadServer, start the proxy pointing at it, and manually send requests to observe behavior.

### Request capture

Like the GoodServer, the BadServer should capture incoming requests in a queue for out-of-band retrieval. The handler decides the response; the capture is automatic regardless of what the handler does. This lets tests assert on what the proxy forwarded even when the response is deliberately broken.

### Threading model

Same as the GoodServer: runs in a background thread with its own event loop (or, since h11 is synchronous, a simple blocking accept loop in a thread). The handler runs in that thread. Request capture uses a thread-safe `queue.Queue`.

Since h11 is synchronous (no asyncio needed), the server can be simpler than the GoodServer — just a `socket.accept()` loop in a thread.

## PoC scenarios

### 1. Truncated response body

- Handler sends `HTTP/1.1 200 OK` with `Content-Length: 1000`, writes 500 bytes, closes.
- Expected proxy behavior: detect the premature close and return 502 to the client.
- Validates: the `truncated_body` handler helper works, the proxy detects upstream errors, the test can assert on the proxy's error response.

### 2. Malformed chunked response

- Handler sends `Transfer-Encoding: chunked`, then sends a chunk with an invalid length field (e.g., `ZZZZ\r\n` instead of a hex number).
- Expected proxy behavior: detect the parse error and return 502.
- Validates: the `malformed_chunks` handler helper works, h11 can construct partial/broken chunked framing.

### 3. Standalone operation

- Start the BadServer from the command line with a truncated-body handler on a fixed port.
- Manually configure Caddy to proxy to it.
- Send a request with curl and observe the proxy's response.
- Validates: standalone mode works for ad hoc debugging.

## Integration with existing architecture

### Dual-upstream proxy configuration

The proxy under test listens on two ports:
- Port X → GoodServer (for happy-path tests)
- Port Y → BadServer (for edge-case tests)

Each test knows which proxy port to use based on which target it needs. The fixture could provide this as a simple object:

```
proxy.echo_url   → http://127.0.0.1:{port_x}
proxy.h11_url    → http://127.0.0.1:{port_y}
```

For Caddy, this means two `reverse_proxy` blocks in the Caddyfile, each on a different listen address. For protospy, it means two upstream definitions.

### Fixed-port mode for debugging

When `--proxy-url` is provided (external proxy), the test suite skips proxy lifecycle. The user must also provide `--target-port` and `--h11-target-port` so the servers start on known ports that match the external proxy's upstream configuration.

### Fixture structure

- `echo_server` — session-scoped, same as current PoC
- `h11_server` — function-scoped (handler changes per test), or session-scoped with a `set_handler()` method that the test calls before each request
- `proxy` — session-scoped, now manages two upstream ports instead of one

Session-scoped BadServer with `set_handler()` is probably better — avoids the overhead of starting/stopping per test and matches how you'd use it in standalone mode (one server, switch scenarios).

## Open questions for the implementer

1. **BadServer concurrency**: Should the server handle one connection at a time (simplest) or multiple? For testing, one at a time is almost certainly sufficient — the test sends one request and waits for the response.

2. **Handler error handling**: If a handler raises an exception, should the server send a 500, close the connection silently, or propagate the error to the test? Propagating seems most useful for debugging.

3. **Request reading completeness**: Should the server always fully read the request body before calling the handler, or should some handlers get the socket mid-request? For most scenarios, reading first is fine. For 100-continue testing, the handler needs control over when it reads the body.

4. **Caddy dual-upstream config**: Verify that Caddy can listen on two separate ports with independent reverse_proxy upstreams in a single Caddyfile. This should work but should be confirmed in the PoC.
