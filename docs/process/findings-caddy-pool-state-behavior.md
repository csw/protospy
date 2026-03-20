# Findings: Caddy Pool-State-Dependent Behavior for Incomplete Chunked Requests

> Investigation commissioned by `docs/process/investigate-caddy-pool-state-behavior.md`.
> See also `docs/process/bug-caddy-state-pollution.md`.

**Environment:** Caddy v2.11.2, aiohttp 3.13.3 (Python 3.14.3), macOS 25.3.0 (ARM)

---

## Summary of Findings

The behavioral difference (200 vs 502) is **not caused by pool state per se**. It is a **race condition** inside Caddy's reverse-proxy request path between two concurrent events:

1. **Context cancellation** — triggered by the client calling `SHUT_WR` (closing its write side without a terminal chunk)
2. **Unexpected EOF from upstream** — triggered by aiohttp closing the upstream TCP connection without sending an HTTP response

Which event wins the race determines Caddy's response code:

| Winner | Caddy's upstream roundtrip error | Caddy's response to client |
|--------|----------------------------------|---------------------------|
| Context cancellation (client) | `"context canceled"` | **200 OK** (empty body) |
| Unexpected EOF (upstream) | `"unexpected EOF"` | **502 Bad Gateway** |

Connection-pool warmth is a **reliable proxy** for which event wins, because a warm pool eliminates TCP-handshake latency:

- **Cold pool (new connection):** Caddy must complete a TCP handshake (~0.5–1 ms) before it can write to aiohttp. The client's `SHUT_WR` has already been processed by Go's HTTP server during this time, so context cancellation arrives first → **200**.
- **Warm pool (reused connection):** No handshake latency. Caddy writes to aiohttp immediately. aiohttp closes the connection before the context cancellation propagates → **502**.

This is why the cold/warm distinction is a reliable predictor of outcome, even though pool warmth is not the root cause.

---

## Question 1: What is on the wire between Caddy and aiohttp?

Observed via tcpdump capture (port 9100) in both cases:

**Cold pool (new TCP connection):**
```
Caddy → aiohttp: POST /echo/cold-test HTTP/1.1
                 Transfer-Encoding: chunked
                 [headers]

                 c\r\npartial data\r\n   (one well-formed chunk)
Caddy → aiohttp: FIN  (following client's SHUT_WR; no terminal 0\r\n\r\n)
aiohttp → Caddy: ACK, ACK, ACK
aiohttp → Caddy: FIN  (closes connection, no HTTP response bytes)
```

**Warm pool (reused connection — same port/connection as prior GET requests):**

Identical byte sequence on the wire. Caddy sends the same request bytes on the existing TCP connection, and aiohttp closes identically with no HTTP response.

**Answer:** The bytes Caddy sends to aiohttp are **identical** in both cases. aiohttp sends **no HTTP response bytes** in either case — it closes the TCP connection immediately upon receiving the incomplete chunked body.

---

## Question 2: Does aiohttp behave differently on a keep-alive connection vs a fresh connection?

Tested via `conformance/scripts/direct_aiohttp_test.py`, which bypasses Caddy entirely:

- **Case 1 (fresh connection):** send incomplete chunked POST → aiohttp closes with no response (returns `None`)
- **Case 2 (reused connection):** send GET (well-formed), read full response, then send incomplete chunked POST on the same socket → aiohttp closes with no response again (returns `None`)

**Answer:** aiohttp's behavior is **identical** on fresh and reused connections. In both cases it closes the TCP connection without sending any HTTP response when it receives an incomplete chunked body. aiohttp is **not** responsible for the 200 vs 502 difference.

---

## Question 3: Where does the 502 originate?

From Caddy's debug-level logs (captured during test suite runs):

**200 case — Caddy log:**
```json
{
  "msg": "upstream roundtrip",
  "uri": "/chunked-error-test?_test=incomplete-chunked-request",
  "transfer_encoding": ["chunked"],
  "error": "context canceled",
  "duration": 0.000115
}
```

**502 case — Caddy log:**
```json
{
  "msg": "upstream roundtrip",
  "uri": "/chunked-error-test?_test=incomplete-chunked-request",
  "transfer_encoding": ["chunked"],
  "error": "unexpected EOF",
  "duration": 0.0000435
}
{
  "msg": "unexpected EOF",
  "status": 502,
  "err_trace": "reverseproxy.statusError (reverseproxy.go:1525)"
}
```

**Answer:** Caddy generates the 502 itself. It does **not** come from aiohttp. Caddy generates it when the upstream TCP connection closes without an HTTP response ("unexpected EOF"). When the client's context is canceled first, Caddy instead returns a synthetic 200 with an empty body (a quirk of Caddy's request-cancellation handling).

---

## Root Cause: Race Condition in Caddy's Reverse Proxy

The race is between:

```
Goroutine A (client-side):
  client calls SHUT_WR
  → Go's net/http reads EOF on request body
  → request context is canceled

Goroutine B (upstream-side):
  Caddy writes request to upstream (aiohttp)
  → aiohttp closes connection with FIN (no response)
  → Caddy reads unexpected EOF
```

**If A wins → "context canceled" → 200:**
Caddy's roundtrip fails because the context is already done. Caddy does not have a response to forward. Caddy generates `200 OK` with an empty body (observed behavior; appears to be Caddy treating a mid-flight cancellation as a successful no-op).

**If B wins → "unexpected EOF" → 502:**
Caddy's roundtrip fails because aiohttp closed the connection. Caddy correctly identifies this as an upstream failure and returns `502 Bad Gateway`.

**Why pool state biases the race:**
On a cold pool, the TCP handshake (SYN / SYN-ACK / ACK) adds ~0.5–1 ms of latency to goroutine B, giving goroutine A time to cancel the context. On a warm pool, goroutine B has no handshake overhead and completes the upstream write + receives the EOF before goroutine A cancels the context.

The race is genuinely non-deterministic: even in "warm pool" conditions, 200 occurs occasionally, and even in "cold pool" conditions, 502 can occur (though rarely).

---

## Would `keepalive off` eliminate the inconsistency?

Yes, but in a specific direction: `keepalive off` ensures every request uses a new TCP connection (cold pool), making the context-cancellation path win the race consistently → always 200. This eliminates the 200/502 inconsistency, but 200 is arguably the **less correct** behavior (the proxy accepted and "forwarded" a malformed request without detecting the violation).

`keepalive off` is **not** recommended for the conformance suite for this reason: it suppresses the more informative 502 behavior and makes Caddy appear to silently accept incomplete chunked requests.

---

## Implications for the Conformance Suite

1. **Neither 200 nor 502 is stable** — the outcome is a race condition. The test correctly does not assert a specific status code and instead records it as a finding.

2. **The module-scoped proxy fix is correct and sufficient.** It eliminates cross-module state pollution (the original symptom: test results depending on which tests ran before them). It does not eliminate the underlying race condition, but that race is a property of Caddy's behavior under this malformed request, not a test infrastructure artifact.

3. **The correct RFC behavior would be 400 Bad Request.** Caddy neither validates the chunked framing before forwarding (which would produce a 400 from Caddy itself) nor passes through aiohttp's connection-close cleanly (which would produce a 502). The 200 case is the most concerning: Caddy returns 200 when it should have detected or surfaced an error.

4. **`keepalive off` as an option:** If a stable, deterministic result is needed for this specific test case, adding `transport { keepalive off }` to the Caddy reverse_proxy directive would consistently produce 200 (context canceled). This is controllable from the Caddyfile and does not change aiohttp's behavior.

---

## Supporting Artifacts

- `conformance/scripts/direct_aiohttp_test.py` — standalone script to test aiohttp's behavior directly on fresh vs reused connections
- Packet captures: `caddy-cold.pcap`, `caddy-warm.pcap` (collected at `private/tmp/claude-501/investigation/`)
- Caddy debug logs: collected during suite runs, stored at `private/tmp/claude-501/investigation/caddy-suite-*.log`
