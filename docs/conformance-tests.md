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

### Streaming proxy implications

A streaming proxy forwards response headers and body incrementally. Once it has started forwarding, it cannot retroactively return a 5xx status. When the upstream fails mid-response (truncated body, missing final chunk, stall after partial data), the only correct signal is closing the connection. Default expectations for these tests should be `ConnectionDrop`, not `ClientExpectation(status=502)`.

Tests where the upstream fails *before* the proxy starts forwarding (unreachable, garbage response, pre-response stall) can and should expect a proper error status.

### Findings

Findings are recorded via `findings.record(test_id, message, level)` and shown with `--findings`. They document behavioral observations:

- **"finding"**: RFC deviation worth noting (e.g., "proxy returned 502 instead of 400").
- **"info"**: Neutral observation (e.g., "proxy forwarded 100 Continue").

Findings exist alongside assertions. A test that records a finding must still assert.

## Components

### GoodServer

### WireServer

### httpx tests for conformant HTTP interactions

### h11 tests for HTTP misbehavior and low-level control

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
