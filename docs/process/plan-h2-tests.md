# Plan: HTTP/1.1 → HTTP/2 Bridging Tests

## Goal

Test that the proxy correctly translates HTTP/1.1 requests into HTTP/2 when forwarding to an h2c upstream. This covers protocol-level details that the existing gRPC tests exercise implicitly but don't verify directly.

## Context

When a proxy receives an HTTP/1.1 request and forwards it to an HTTP/2 upstream, it must translate protocol-specific framing:

- **`Host` → `:authority`**: HTTP/2 replaces the `Host` header with the `:authority` pseudo-header. The proxy must set `:authority` from the incoming `Host`.
- **`Transfer-Encoding: chunked` must not appear in HTTP/2**: H2 handles framing at the protocol layer. The proxy must strip `Transfer-Encoding` when bridging.
- **Request line → pseudo-headers**: The H1.1 method and path become `:method` and `:path`. This is largely "does the request work at all" but worth verifying explicitly.

The gRPC tests prove that h2c proxying works end-to-end, but gRPC abstracts away the HTTP/2 headers — we can't inspect pseudo-headers or verify header stripping through the gRPC client.

**Scope:** H1.1 client → proxy → h2c upstream only. The proxy only needs to act as an HTTP/1.1 server, so H2 client → proxy is out of scope. WebSocket-over-H2 (RFC 8441) is a future item.

## Design

### H2c echo server

A new `H2cServer` using the `h2` library (pure Python, lightweight). It accepts cleartext HTTP/2 connections, reads requests including pseudo-headers, and echoes them back as JSON:

```json
{
  "pseudo_headers": {":method": "POST", ":path": "/foo", ":authority": "example.com", ":scheme": "http"},
  "headers": {"content-type": "application/octet-stream"},
  "body_length": 1024
}
```

The key difference from GoodServer's `/echo` endpoint: pseudo-headers are visible and reported separately. The `h2` library exposes these directly, which is exactly why we need it.

Same lifecycle pattern as GrpcServer: dataclass with `host`, `port`, `start()`, `stop()`, background thread.

### Proxy listener

A 5th proxy listener (`h2c`) alongside good, wire, dead, and grpc. Configuration mirrors the grpc listener — accepts HTTP/1.1 from clients, forwards via h2c transport to the H2cServer upstream.

`ProxyUrls` gains `h2c_url`, `h2c_host`, `h2c_port` fields.

### Tests

| Test | Sends | Verifies |
|------|-------|----------|
| `test_host_to_authority` | `Host: example.com` via H1.1 | `:authority` is `example.com` on h2c upstream |
| `test_chunked_te_stripped` | Chunked body via H1.1 | Body arrives intact, no `Transfer-Encoding` header on upstream |
| `test_request_method_path` | `POST /foo/bar` via H1.1 | `:method` is `POST`, `:path` is `/foo/bar` on upstream |

Tests use the standard `proxy` fixture and `httpx` client — same pattern as all other tests.

## Dependencies

Add `h2` to `conformance/pyproject.toml`. Pin to current major version.

## Files

- `conformance/pyproject.toml` — add `h2` dependency
- `conformance/src/proxy_conformance/h2c_server.py` — new
- `conformance/tests/proxies.py` — add h2c listener to both proxy configs, extend ProxyUrls
- `conformance/tests/conftest.py` — add h2c_server fixture, wire into proxy
- `conformance/tests/test_h2_bridging.py` — new
- `docs/conformance-test-catalog.md` — add H2 bridging category
