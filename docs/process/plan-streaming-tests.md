# Plan: Streaming Response Conformance Tests

## Goal

Verify that the proxy forwards response chunks incrementally as they arrive from upstream, rather than buffering the entire response before forwarding. Also verify that the proxy tears down the upstream connection when the client disconnects mid-stream.

## Context

The existing test suite verifies that bodies arrive intact (category 6) and that large bodies work (§6.7), but nothing tests *temporal* forwarding behavior — whether chunks are forwarded as they arrive or buffered until the response completes. A buffering proxy would pass all current body framing tests while silently breaking streaming use cases (SSE, long-running downloads, chunked APIs).

This is a general HTTP streaming concern, not specific to SSE or any particular content type. From the proxy's perspective, it's about chunked transfer-encoding behavior under incremental delivery.

## Design

### Synchronization-based approach

Rather than relying on timing (sleep between chunks, measure arrival gaps), tests use a deterministic gating mechanism:

1. WireServer handler sends chunk N, then blocks on `threading.Event` N
2. Test client reads chunk N from the streaming response
3. Test sets event N, releasing the handler to send chunk N+1

If the proxy buffers the full response, the client's read blocks forever — chunk 1 never arrives because the response isn't complete, and the handler is blocked waiting for the gate that only gets set after the client reads. Deterministic, no sleeps, no timing sensitivity.

### New handler: `gated_chunks()`

A WireServer handler that accepts a list of chunks and a corresponding list of `threading.Event` gates:

```python
def gated_chunks(
    chunks: list[bytes],
    gates: list[threading.Event],
) -> Handler:
```

Sends `Transfer-Encoding: chunked` response headers, then for each chunk: sends the chunk, then waits on the corresponding gate before continuing. After the final chunk, sends the terminal zero-length chunk.

This handler is test-only — it relies on out-of-band coordination between client and server and would not be registered in `register_default_routes()` for standalone CLI usage.

### Client disconnect detection

For the client-disconnect test, the handler needs to signal when it detects the socket has closed. A `threading.Event` (e.g., `upstream_closed`) that the handler sets when `sendall` raises `BrokenPipeError` or `ConnectionResetError`. The test disconnects the client, sets the next gate to unblock the handler, and then asserts `upstream_closed` gets set promptly.

### Tests

New category **18: Streaming response behavior** in the test catalog, new file `test_streaming.py`.

| Test | What it verifies |
|------|-----------------|
| `test_chunked_stream_not_buffered` | Proxy forwards each chunk before the next one exists. Client reads 3–5 gated chunks sequentially — each read succeeds before the next chunk is sent. |
| `test_client_disconnect_closes_upstream` | Client reads 1–2 chunks then disconnects. Upstream detects the closed connection (handler's `upstream_closed` event is set). Proxy doesn't leak the upstream connection. |

### What this doesn't test

- SSE semantics (client-side concern, not a proxy behavior)
- HTTP/2 streaming (covered by gRPC tests in §17)
- Long-lived idle connections / aggressive timeouts (not relevant for protospy)
- Request body streaming (client controls send rate; less interesting for a reverse proxy)

## Files

- `conformance/src/proxy_conformance/wire_server.py` — add `gated_chunks()` handler (not registered in default routes)
- `conformance/tests/test_streaming.py` — new
- `docs/conformance-test-catalog.md` — add category 18
