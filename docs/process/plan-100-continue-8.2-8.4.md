# Plan: 100-Continue Tests 8.2–8.4

> **Prerequisite:** The 8.1 plan (`plan-100-continue.md`) must be
> implemented first. This plan builds on the handler model, h11 client
> function, and test structure established there.

**Goal:** Implement conformance tests 8.2, 8.3, and 8.4 from the test
catalog (§8, 100-continue).

## h11 state machine context

These tests were blocked on uncertainty about h11's behavior when the
server deviates from the standard 100-continue flow. Investigation of
h11's source confirms:

- **`PAUSED` is not a state** — it's a `next_event()` return value.
  The actual state is `SEND_RESPONSE`. The
  `client_is_waiting_for_100_continue` flag is purely advisory flow
  control that doesn't restrict state transitions.

- **Sending a final `Response` without sending 100 first is allowed.**
  The `SEND_RESPONSE → SEND_BODY` transition accepts `Response`
  directly. Tests 8.2 and 8.3 can use h11 normally — no need to
  bypass it with raw socket writes.

- **h11 requires consuming the client body before `start_next_cycle`**,
  but WireServer closes the connection after each request, so this
  doesn't matter. Handlers that skip the 100 can just send their
  response and return.

- **Client body sent without waiting for 100 is parsed normally** by
  h11's server side. The flag is cleared when body data arrives.

## Tests

### 8.2 — Upstream ignores Expect, sends final response

**Catalog:** Upstream doesn't send 100 and instead sends the final
response directly. The proxy should forward the final response.

**Handler:** New factory function in `wire_server.py`. Sends
`Response(200)` directly via h11 (no `InformationalResponse`),
followed by a body and `EndOfMessage`. Follow the pattern of
`continue_and_echo()` from 8.1 but skip the 100 and don't read the
request body.

**Route:** `/continue/skip-100` (registered in conftest.py alongside
the 8.1 route)

**Test:** Uses `send_with_expect_continue()` from 8.1. Asserts:
- `result.final.status == 200`
- `result.got_100 is False`
- Body handling is informational — record as a finding whether the
  proxy forwarded the body to the upstream despite getting no 100

### 8.3 — Upstream rejects with 417

**Catalog:** Upstream rejects with 417 Expectation Failed. Body should
not be sent or forwarded.

**Handler:** New factory function. Sends `Response(417)` with empty
body via h11, then `EndOfMessage`. Returns immediately.

**Route:** `/continue/reject`

**Test:** Uses `send_with_expect_continue()`. Asserts:
- `result.final.status == 417`
- `result.got_100 is False`

**Client function interaction:** `send_with_expect_continue()` must
already handle this path — when it reads a final `Response` (not
`InformationalResponse`) before sending the body, it should not send
the body. Verify the 8.1 implementation handles this; if not, fix it.

### 8.4 — Client sends body without waiting for 100

**Catalog:** Client sends `Expect: 100-continue` but sends the body
immediately. Proxy should handle gracefully.

**Handler:** Reuses `continue_and_echo()` from 8.1 — the server
behavior is the same. The difference is entirely on the client side.

**Route:** `/continue` (same as 8.1)

**Client function change:** Add a `wait_for_100: bool = True`
parameter to `send_with_expect_continue()`. When `False`:
1. Send `Request` headers with `Expect: 100-continue`
2. Immediately send `Data` + `EndOfMessage` (don't read for 100 first)
3. Then read response(s) — may get `InformationalResponse` and/or
   final `Response` in any order

h11 allows this: the client is in `SEND_BODY` after sending `Request`,
and `Data`/`EndOfMessage` are legal regardless of the advisory flag.

**Test:** Calls `send_with_expect_continue(..., wait_for_100=False)`.
Asserts:
- `result.final.status == 200`
- `result.final.body == body` (echoed back)
- WireServer received the full body (`captured.body == body`)
- Whether 100 was received is informational

## Proxy quirks

Caddy and HAProxy may handle these edge cases differently. Discover
quirks empirically by running the tests, then add `ProxyQuirk` entries
as needed. Don't guess quirks in advance.

## Verification

- [ ] All quality checks pass (`ruff check`, `ruff format --check`,
      `pyright`, `pytest`)
- [ ] Tests pass for `--proxy caddy` and `--proxy haproxy`
- [ ] Review findings output for proxy-specific 100-continue behavior
