# Supplementary Findings: Caddy Source Code Analysis of Pool-State Behavior

> Companion to `findings-caddy-pool-state-behavior.md`, which contains the wire-level and
> empirical investigation. This document evaluates those findings against the Caddy and Go
> stdlib source code.
>
> **Caddy source:** `~/src/ext/caddy` (master, commit 5d189aff)
> **Go stdlib source:** `/usr/local/go/src/net/http/`

---

## Verdict

The analysis in the companion document is **correct**. Every causal claim maps cleanly to
identifiable source locations. The following sections trace each claim to code.

---

## 1. `context.Canceled` → 200: The Core Mechanism

The companion document states that when context cancellation wins the race, Caddy returns 200.
This is fully explained by a single guard in `proxyLoopIteration`:

**`modules/caddyhttp/reverseproxy/reverseproxy.go:653-656`**
```go
if proxyErr == nil || errors.Is(proxyErr, context.Canceled) {
    // context.Canceled happens when the downstream client
    // cancels the request, which is not our failure
    return true, nil
}
```

When `Transport.RoundTrip` returns `context.Canceled`, `reverseProxy` returns that error to
`proxyLoopIteration`, which immediately returns `(done=true, err=nil)`. The outer proxy loop
then checks `if proxyErr != nil { return statusError(proxyErr) }` — but `proxyErr` was never
set to the cancellation error. `ServeHTTP` returns without writing any response. Go's
`net/http` server then implicitly writes `200 OK` with an empty body.

**This is the complete chain for the cold-pool 200.** It is not a coincidence or a timing
artifact in how the response is assembled — it is a deliberate Caddy design decision
(treat client-initiated cancellation as a non-failure) that fires in an unintended case
(the client half-closed its write side via `SHUT_WR`, not the full connection).

Note that even if `context.Canceled` *did* reach `statusError`, the result would be **499**,
not 200 (`reverseproxy.go:1519-1523`). The 200 is uniquely produced by the line 653
short-circuit, not by any response code mapping.

---

## 2. `unexpected EOF` → 502: The Warm-Pool Path

**`modules/caddyhttp/reverseproxy/reverseproxy.go:1502-1526`**
```go
func statusError(err error) error {
    statusCode := http.StatusBadGateway  // default: 502

    if err, ok := err.(net.Error); ok && err.Timeout() {
        statusCode = http.StatusGatewayTimeout
    }
    if errors.Is(err, context.Canceled) || strings.Contains(err.Error(), "operation was canceled") {
        statusCode = 499
    }
    return caddyhttp.Error(statusCode, err)
}
```

`io.ErrUnexpectedEOF` satisfies none of the special cases: it is not a `net.Error` with
`Timeout()`, and it does not wrap `context.Canceled`. It falls through to the default
`http.StatusBadGateway`. This is the source of the 502 in the warm-pool case.

---

## 3. The Race in `persistConn.roundTrip`

The race is inside the `select` loop in Go stdlib's `persistConn.roundTrip`
(`net/http/transport.go:2909-2948`):

```go
for {
    select {
    case err := <-writeErrCh:      // write to upstream failed
        if err != nil {
            pc.close(...)
            return nil, pc.mapRoundTripError(req, startBytesWritten, err)
        }
        // write succeeded; arm the response-header timeout and keep waiting

    case <-pcClosed:               // connection was closed
        select {
        case re := <-resc:         // (check if response arrived simultaneously)
            return handleResponse(re)
        default:
        }
        return nil, pc.mapRoundTripError(req, startBytesWritten, pc.closed)

    case re := <-resc:             // upstream sent a response
        return handleResponse(re)

    case <-ctxDoneChan:            // request context was canceled
        select {
        case re := <-resc:
            return handleResponse(re)
        default:
        }
        pc.close(errRequestCanceled)
        return nil, pc.mapRoundTripError(req, startBytesWritten, err)
    }
}
```

**Cold pool:** The TCP handshake (~0.5–1 ms on loopback) delays goroutine B (upstream write).
During this time, goroutine A (Go's server processing the client FIN from `SHUT_WR`) cancels
the request context. `ctxDoneChan` fires first → `context.Canceled` returned from
`persistConn.roundTrip` → Caddy's line 653 swallows it → 200.

**Warm pool:** No dial overhead. The request is written to upstream immediately. aiohttp
closes the connection without sending a response. `resc` receives `io.ErrUnexpectedEOF`
before the context cancellation propagates. `handleResponse` returns the error →
`statusError` → 502.

The comment in the transport source at line 2877 is directly relevant:
```go
// Write the request concurrently with waiting for a response,
// in case the server decides to reply before reading our full
// request body.
```
The race is an intentional design choice in the stdlib, not a bug there.

---

## 4. Why Retries Don't Factor In

`shouldRetryRequest` (`net/http/transport.go:818-863`) has two paths that might seem
relevant:

- **`nothingWrittenError`** (line 842): only applies when `pc.nwrite == startBytesWritten`,
  i.e., nothing was written at all. In our case, request headers and a partial chunk *were*
  written, so `pc.nwrite > startBytesWritten`. This path does not apply.

- **`transportReadFromServerError`** (line 851): allows retry, but only after the
  `!req.isReplayable()` check at line 847. A POST request with a streaming chunked body has
  no `GetBody` function and is not replayable. `shouldRetryRequest` returns false before
  reaching the `transportReadFromServerError` case.

There are no retries in either path. The error from the first (and only) `persistConn.roundTrip`
call is what Caddy acts on.

---

## 5. The Actual Bug in Caddy

The `context.Canceled` short-circuit at `reverseproxy.go:653` is intentionally designed for
the case where the downstream client fully closes the connection mid-flight, making the
response irrelevant. The comment says as much: "not our failure."

However, `SHUT_WR` half-closes only the *write* side of the client connection. The client
is still reading — it is waiting for Caddy's response. Go's `net/http` server nonetheless
cancels the request context when it sees EOF on the request body stream (the read side of
the server's view of the client socket receives the FIN). This is a reasonable thing for the
server to do in general, but it has the side effect of triggering Caddy's cancellation guard
in a case where the client is still present and expecting a response.

The result: Caddy returns 200 to a client that sent a malformed request. The client receives
a response — it just happens to be the wrong one.

---

## 6. Consistency with Wire-Level Findings

The companion document reports (via tcpdump) that aiohttp sends **no HTTP response bytes**
in either case — it closes the connection with a bare FIN. This is consistent with the code:
if aiohttp had sent any response bytes, `readResponse` would have parsed them, `resc` would
have received a valid `*Response`, and `RoundTrip` would have returned success. The
`unexpected EOF` error is the correct Go result when a TCP connection closes before a
complete HTTP response header is received.

The companion document also confirms that aiohttp's behavior is identical on fresh and
reused connections (tested by bypassing Caddy entirely). This is consistent with the code
analysis: the pool state affects only which event wins the race inside Caddy's transport
layer, not anything aiohttp does.

---

## Summary Table

| Claim | Status | Code location |
|-------|--------|---------------|
| `context.Canceled` → 200 | ✅ Confirmed | `reverseproxy.go:653-656` |
| `unexpected EOF` → 502 | ✅ Confirmed | `reverseproxy.go:1502-1526` (statusError) |
| Race in `persistConn.roundTrip` select | ✅ Confirmed | `transport.go:2909-2948` |
| TCP handshake latency biases race | ✅ Mechanically sound | (timing, not code) |
| No retries for POST with body | ✅ Confirmed | `transport.go:847-850` |
| aiohttp behavior identical on fresh/reused | ✅ Consistent with code | (wire-level empirical) |
| 200 is produced by Caddy, not aiohttp | ✅ Confirmed | `reverseproxy.go:653` |
| 502 is produced by Caddy, not aiohttp | ✅ Confirmed | `reverseproxy.go:1502-1526` |
