# Conformance tests

## Overview

The most fundamental requirement for protospy is that it is a correct HTTP reverse proxy; it must be able to be transparently dropped in between services. To validate this, we have a standalone end-to-end HTTP reverse proxy conformance test suite in `conformance/`.

To ensure that the conformance tests and protospy don't co-deviate from correct HTTP behavior, they use well-known HTTP reverse proxies as reference targets. These are currently Caddy and HAProxy. Any deviation from their behavior (aside from specifically defined quirks) will therefore be detected.

## Tested functionality

See [conformance-test-catalog.md](conformance-test-catalog.md) for the specific proxy behaviors covered by the test suite.

## Assertion policy

### Core rule: every test asserts for every proxy

No test may be assertion-free. For each proxy, the test must assert the **known expected behavior of that proxy**:

- **Default expectations** reflect RFC-correct or protospy-desired behavior. They apply to any proxy without a quirk entry, including future protospy.
- **Quirk overrides** specify what a reference proxy actually does when it deviates from the default. The test asserts the *override* expectation, validating that the proxy still behaves as documented.
- **Findings** record the delta between what the proxy does and what the RFC says. They are observational annotations alongside assertions, not replacements for them.

Testing against reference proxies serves two purposes beyond validating our own proxy: it gives us direct empirical knowledge of real proxy behavior to inform design decisions, and it validates the tests themselves. If a reference proxy suddenly returns an unexpected result, the test should fail, signaling that either the proxy changed or the test is broken.

### Quirk dispositions

| Disposition | When to use | Assertion behavior |
|---|---|---|
| `override` | Proxy behavior differs from default but is understood and stable. | Assert the override expectations. Record a finding noting the RFC deviation. |
| `xfail` | Proxy has a known bug; behavior is incorrect and not yet fixed upstream. | Mark expected failure (`pytest.xfail`). |
| `skip` | Test cannot run for this proxy (missing capability). | Skip entirely (`pytest.skip`). |

There is no assertion-free disposition. If we don't know what a proxy does for a given test, we run the test, observe, and then add a quirk documenting the observed behavior.

### Expected outcomes

Test outcomes are modeled as a union type (`Outcome` in `types.py`):

- **`ClientExpectation`**: an HTTP response with specific status, headers, body.
- **`ConnectionDrop`**: the proxy closes the connection without responding.

A quirk or default expectation can be a single `Outcome` or a list of them (ORed). A list expresses non-deterministic behavior: the result must match at least one entry.

For example, when a reference proxy has racy behavior (sometimes drops the connection, sometimes returns a status code), the quirk lists all observed outcomes. The test fails if an *unexpected* outcome appears.

### Streaming vs. buffering proxy implications

Whether the proxy has started forwarding the response determines what error signals are available:

- **After forwarding starts (streaming):** The proxy has already sent response headers to the client. If the upstream then fails mid-body (truncated body, missing final chunk, stall after partial data), the proxy cannot retroactively send a 5xx status. The only option is closing the connection (`ConnectionDrop`).
- **Before forwarding starts (buffering or early failure):** The proxy has not committed to a response. It can detect the upstream error and return a proper status like 502 Bad Gateway.

Default expectations for mid-response failures should accept both outcomes: `[ConnectionDrop(), ClientExpectation(status=502)]`. A buffering proxy that detects the error before forwarding is equally correct to a streaming proxy that drops the connection. Tests where the upstream fails *before* the proxy starts forwarding (unreachable, garbage response, pre-response stall) can and should expect a proper error status only.

### Wire-level vs. client-response testing

When the client-facing outcome is non-deterministic — the RFC permits multiple valid responses, or the proxy's buffering strategy makes the status code unpredictable — prefer wire-level inspection via WireServer over client-response assertions.

The pattern (established in [PRO-77](https://linear.app/protospy/issue/PRO-77)):
1. Register a programmable WireServer handler that captures what the proxy actually forwarded (headers, body bytes, trailers, timing).
2. Assert on the **wire-level protocol property** — the thing the RFC actually requires (e.g., "proxy forwarded the request to the backend," "proxy did not send body bytes after receiving 417").
3. Record the client-facing outcome as a **finding** rather than asserting on it.

This approach is preferred for incomplete-message tests, error-path tests, timeout tests, and any scenario where the client-visible status depends on proxy-internal buffering or timing decisions. Examples: `test_client_body_stall` (§10.4), `test_417_forwarded` (§8.3), `test_request_trailers_forwarded` (§7.1).

### Findings

Findings are recorded via `findings.record(test_id, message, level)` and shown with `--findings`. They document behavioral observations:

- **"finding"**: RFC deviation worth noting (e.g., "proxy returned 502 instead of 400").
- **"info"**: Neutral observation (e.g., "proxy forwarded 100 Continue").

Findings exist alongside assertions. A test that records a finding must still assert.

### Assertion philosophy: defaults vs. RFC permission space

Default expectations express what we consider correct behavior for a well-behaved streaming proxy, not the full set of RFC-permitted outcomes. When a reference proxy deviates from the default, that deviation is documented as a quirk. This is intentional — the defaults define a quality bar, and quirks track where real proxies fall short or differ.

However, some test scenarios have a genuinely broad correct-outcome set where no single behavior is "more correct." For example, when a client sends request headers but never sends the promised body (§10.4), the RFC permits 200, 400, 408, 504, or connection close depending on the proxy's timeout strategy. In these cases:

- Assert on **wire-level protocol properties** (what the proxy forwarded, what bytes reached the backend).
- Accept the full conformant status set for client-facing outcomes, or record them as findings.
- Do not create quirks for every proxy — if the default must list every proxy as a quirk, the default is wrong.

The heuristic: if both reference proxies need quirks and the "default" behavior doesn't match any real proxy, the test is over-asserting. Widen the default or switch to wire-level testing.

### Quirk reliability

Quirks are calibrated empirically by running tests against reference proxies. Two sources of unreliability:

1. **Quirks from broken tests.** If a quirk was added to make a flawed test pass, it captures the proxy's behavior under incorrect test conditions, not correct ones. When the test is fixed, the quirk may need to change or be removed. (Example: trailer tests using GoodServer, which can't observe request trailers, led to incorrect "strips trailers" quirks for HAProxy.)
2. **Non-deterministic behavior.** Some proxy behaviors are low-frequency race conditions that surface only under CI load. Quirks calibrated from local runs may be incomplete.

Wire-level tests are more resilient to both problems: they assert on forwarded bytes (deterministic) and record client-facing outcomes as findings (tolerant of non-determinism).

## Components

### GoodServer

`GoodServer` (`src/proxy_conformance/good_server.py`) is a well-behaved aiohttp target server. It runs in a background thread and provides endpoint-based routing for common test scenarios: echo, status codes, redirects, custom response headers, chunked and content-length bodies, gzip, trailers, and WebSocket. Every request is captured for out-of-band retrieval via `last_request()`.

Use GoodServer when the test needs a **conformant** upstream that responds normally. It backs all httpx-based tests (request/response forwarding, hop-by-hop headers, body framing, etc.).

**Limitation:** aiohttp's `request.headers` only exposes the initial HTTP header section. GoodServer cannot observe HTTP/1.1 request trailers — use WireServer for trailer tests.

### WireServer

`WireServer` (`src/proxy_conformance/wire_server.py`) is a programmable raw HTTP server built on h11. It accepts a single connection at a time and dispatches to registered route handlers that have full control over the raw HTTP exchange — they can send malformed responses, stall mid-body, close connections early, send 1xx informational responses, or capture exactly what bytes the proxy forwarded.

Use WireServer when the test needs to:
- **Send non-conformant responses** (truncated bodies, invalid chunks, missing headers).
- **Observe wire-level protocol properties** (what headers/body/trailers the proxy forwarded, whether the proxy modified encoding).
- **Control timing** (stall before response, stall mid-body, delay to trigger proxy timeouts).
- **Inspect request trailers** — h11's `EndOfMessage.headers` captures HTTP/1.1 trailers that aiohttp cannot see.

WireServer handlers use `threading.Event` and shared mutable state for cross-thread signaling, allowing tests to make assertions about what the proxy forwarded independently of the client-facing response.

### httpx tests for conformant HTTP interactions

Tests using `httpx.Client` exercise the proxy's handling of well-formed HTTP traffic. httpx sends conformant requests and parses conformant responses, making it suitable for testing request/response forwarding, header handling, body framing, redirects, and other scenarios where both client and server follow the protocol.

These tests typically route through GoodServer and assert on the response status, headers, and body. They are the bulk of the suite (categories 1–6, 11–14).

### h11 tests for HTTP misbehavior and low-level control

Tests using the h11 raw client (`src/proxy_conformance/h11_client.py`) or raw sockets exercise scenarios that require sending or receiving non-standard HTTP. h11 gives byte-level control over what is sent to the proxy, allowing tests to send malformed requests, incomplete messages, oversized headers, or HTTP/1.1 features that httpx abstracts away (chunked encoding with trailers, Expect: 100-continue flows).

These tests cover edge cases (category 7), 100-continue (category 8), upstream error handling (category 9), timeouts (category 10), and protocol violations (category 15–16). They often pair with WireServer to verify both what the proxy received from the client and what it forwarded to the backend.

## Targets

The suite parametrizes every test over a set of proxy targets selected
with `--proxy`. The taxonomy lives in
`conformance/src/proxy_conformance/targets.py`:

| `proxy_type`        | What it runs                                                                 |
|---------------------|------------------------------------------------------------------------------|
| `caddy`             | Caddy reference proxy, started by the suite.                                 |
| `haproxy`           | HAProxy reference proxy, started by the suite.                               |
| `protospy-bypass`   | `cargo run` with no `--print-messages` — exercises the default bypass path.  |
| `protospy-capture`  | Same binary plus `--print-messages` — exercises the capture path.            |
| `protospy-ext`      | An externally-managed protospy listening on fixed ports (see CLI flags).     |

protospy has two distinct internal paths: bypass (no capture subscribers,
exchange tracking skipped) and capture (logger task subscribed,
`Service::should_report()` is true, bodies are prefetched and exchange
events are published). Both must be HTTP-equivalent, so the suite covers
each as its own target.

Targets are grouped into **families** so test marks and quirks are
written once per logical proxy:

- `caddy` → `{caddy}`
- `haproxy` → `{haproxy}`
- `protospy` → `{protospy-bypass, protospy-capture, protospy-ext}`

`@pytest.mark.xfail_for("protospy")` and
`proxy_quirks={"protospy": ProxyQuirk(...)}` apply to every variant in the
family. A concrete-name entry (e.g. `proxy_quirks={"protospy-capture": ...}`)
takes precedence when present, but the project's working assumption is that
the two modes behave identically — any mode-specific divergence is a bug
in protospy, not a candidate for a per-mode quirk.

Family names also work as shortcuts in `--proxy`:
`--proxy protospy` expands to `protospy-bypass,protospy-capture` (the
managed members of the family). `--proxy all` runs every managed target.

## Usage modes

TODO: ephemeral instances as well as intended preexisting targets
