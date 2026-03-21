# Plan: 100-Continue Support in WireServer

> **For agentic workers:** This plan adds 100-continue support to the
> WireServer handler model and validates it with test 8.1 from the
> conformance test catalog. Steps use checkbox syntax for tracking.
>
> **Prerequisite:** The BadServer → WireServer rename
> (`docs/process/plan-rename-wireserver.md`) should be completed first.
> If it hasn't been done yet, apply this plan to the BadServer code
> using the old names, and rename afterward.

**Goal:** Extend WireServer's handler interface so handlers can
participate in mid-request protocol interactions (specifically
100-continue), then validate the approach with a basic 100-continue
proxy conformance test.

**Context:** WireServer's current handler model reads the full request
body before calling the handler. 100-continue requires mid-request
interaction:

```
Current:    accept → read headers → read body → handler(request, body, socket)
Needed:     accept → read headers → [handler sends 100] → read body → [handler sends response]
```

The handler needs access to the h11 state machine. When h11 sees
`Expect: 100-continue`, it goes to `PAUSED` state after parsing the
request headers — it won't read body data until the server sends a 1xx
response. After `send(InformationalResponse(100))`, h11 unblocks and
body data can be read normally.

**Risk:** The plan assumes h11 unblocks body reading after
`InformationalResponse(100)` is sent. This is how h11 is documented
to work, but step 4 includes a direct integration test to verify it
before building the proxy test.

---

## Steps

### Step 1: Extend the Handler signature

- [ ] Change `Handler` type alias in `wire_server.py` (or `bad_server.py`
      if rename is pending):
      ```python
      # Before
      Handler = Callable[[h11.Request, bytes, socket.socket], None]

      # After
      Handler = Callable[[h11.Request, bytes, socket.socket, h11.Connection], None]
      ```
- [ ] Update `_handle_connection` to pass `h11_conn` as the fourth
      argument to the handler call (one-line change)
- [ ] Update all existing handler factories to accept and ignore the
      new parameter:
      - `truncated_body`: add `_h11_conn: h11.Connection` to inner function
      - `malformed_chunks`: same
      - `echo_handler`: same
- [ ] Update `delayed_100` stub to include the parameter in its
      docstring/signature (it raises `NotImplementedError`, so the body
      doesn't matter — but it should match the new type)
- [ ] Verify: existing tests pass unchanged

### Step 2: Add `continue_and_echo()` handler

- [ ] Add to `wire_server.py`:
      ```python
      def continue_and_echo() -> Handler:
          """100-continue handler: send 100, read body, echo in 200.

          For use with requests carrying Expect: 100-continue. Sends a
          100 Continue informational response via h11, reads the request
          body through h11's state machine, then echoes the body back in
          a 200 response.

          Uses h11 for all protocol interactions (not raw socket writes)
          because the state machine must stay in sync throughout the
          multi-phase exchange.
          """

          def handler(
              request: h11.Request,
              body: bytes,
              conn: socket.socket,
              h11_conn: h11.Connection,
          ) -> None:
              # Send 100 Continue — unblocks h11's read side
              conn.sendall(
                  h11_conn.send(
                      h11.InformationalResponse(status_code=100, headers=[])
                  )
              )

              # Read body through h11
              while True:
                  event = h11_conn.next_event()
                  if event is h11.NEED_DATA:
                      data = conn.recv(65536)
                      if not data:
                          return
                      h11_conn.receive_data(data)
                  elif isinstance(event, h11.Data):
                      body += event.data
                  elif isinstance(event, h11.EndOfMessage):
                      break

              # Send final response via h11
              conn.sendall(
                  h11_conn.send(
                      h11.Response(
                          status_code=200,
                          headers=[
                              ("content-length", str(len(body))),
                              ("content-type", "application/octet-stream"),
                          ],
                      )
                  )
              )
              conn.sendall(h11_conn.send(h11.Data(data=body)))
              conn.sendall(h11_conn.send(h11.EndOfMessage()))

          return handler
      ```
- [ ] Register the route in conftest.py's WireServer fixture:
      `server.add_route("/continue", continue_and_echo())`

### Step 3: Add `send_with_expect_continue()` to h11_client.py

- [ ] Add a result dataclass:
      ```python
      @dataclass
      class ContinueResponse:
          """Result of a request with Expect: 100-continue."""

          got_100: bool       # True if 100 Continue was received before final response
          final: RawResponse  # The final (non-1xx) response
      ```

- [ ] Add the client function:
      ```python
      def send_with_expect_continue(
          host: str,
          port: int,
          path: str = "/",
          body: bytes = b"request body",
          timeout: float = 5.0,
      ) -> ContinueResponse:
          """Send a POST with Expect: 100-continue, wait for 100, then send body.

          Uses h11 on the client side for state machine management:
          1. Send Request with Expect: 100-continue and Content-Length
          2. Read events — expect InformationalResponse(100) or a final Response
          3. If 100: send body (Data + EndOfMessage), then read final Response
          4. If final Response directly (e.g., 417): don't send body
          5. Return ContinueResponse with got_100 flag and final response
          """
      ```

- [ ] Implementation notes:
      - Use h11 `Connection(h11.CLIENT)` for proper state tracking
      - Send `Request` with headers:
        `Host`, `Expect: 100-continue`, `Content-Length: len(body)`,
        `Content-Type: application/octet-stream`
      - Read loop: `next_event()` / `receive_data()` until
        `InformationalResponse` or `Response`
      - If `InformationalResponse`: set `got_100 = True`, send
        `Data(data=body)` + `EndOfMessage()`, then read for `Response`
      - If `Response`: set `got_100 = False`, don't send body
      - Read response body: continue reading `Data` events until
        `EndOfMessage`
      - Convert h11 `Response` to `RawResponse` (reuse existing dataclass)
      - Return `ContinueResponse(got_100=..., final=RawResponse(...))`
      - Wrap socket operations in try/finally for cleanup

### Step 4: Direct integration test

- [ ] In `test_100_continue.py`, add an integration test that bypasses
      the proxy — connects the h11 client directly to WireServer:
      ```python
      class TestContinueIntegration:
          """Verify h11 client ↔ WireServer 100-continue works without a proxy."""

          def test_direct_to_wire_server(
              self, wire_server: WireServer, findings: Findings
          ) -> None:
              parsed = urllib.parse.urlparse(wire_server.url)
              result = send_with_expect_continue(
                  host=parsed.hostname,
                  port=parsed.port,
                  path="/continue",
                  body=b"direct test body",
              )
              assert result.got_100, "WireServer should send 100 Continue"
              assert result.final.status == 200
              assert result.final.body == b"direct test body"
      ```
- [ ] This validates the h11 state machine assumption (step 2 risk
      mitigation) before adding the proxy to the picture
- [ ] If this fails, the h11 state machine doesn't behave as expected
      and the handler model needs rethinking — stop and reassess

### Step 5: Proxy conformance test (catalog 8.1)

- [ ] In `test_100_continue.py`, add:
      ```python
      class TestBasic100Continue:
          """Proxy handling of the basic 100-continue flow (catalog 8.1).

          RFC 9110 §10.1.1: client sends Expect: 100-continue, upstream
          sends 100, client sends body, upstream sends final response.
          The proxy should forward the 100 to the client.
          """

          def test_body_forwarded(
              self,
              proxy: ProxyUrls,
              wire_server: WireServer,
              findings: Findings,
              proxy_name: str,
          ) -> None:
              result = send_with_expect_continue(
                  host=proxy.wire_host,
                  port=proxy.wire_port,
                  path=_test_url("/continue", "basic-100-continue"),
                  body=b"the request body",
              )

              assert result.final.status == 200
              assert result.final.body == b"the request body"

              # Did the proxy forward the 100?
              if result.got_100:
                  findings.record(
                      "basic-100-continue",
                      f"[{proxy_name}] Proxy forwarded 100 Continue to client",
                      level="info",
                  )
              else:
                  findings.record(
                      "basic-100-continue",
                      f"[{proxy_name}] Proxy absorbed 100 Continue "
                      "(sent final response directly)",
                      level="finding",
                  )

              # Verify upstream received the full body
              captured = wire_server.last_request()
              assert captured.body == b"the request body"
      ```
- [ ] **On `got_100` assertion:** RFC 9110 §10.1.1 says a proxy MUST
      forward 1xx responses unless the proxy itself generated the Expect.
      But many proxies (including Caddy) manage Expect internally and
      absorb the 100. Record as a finding for now; harden for protospy
      later.

### Step 6: Verify

- [ ] `uv run ruff check .` clean
- [ ] `uv run ruff format --check .` clean
- [ ] `uv run pyright .` clean
- [ ] `uv run pytest` passes for `--proxy caddy`
- [ ] `uv run pytest` passes for `--proxy haproxy`
- [ ] Inspect findings output for 100-continue behavior of each proxy
- [ ] Direct integration test (step 4) passes — confirms h11 state
      machine assumption

## Design notes

### Why h11.Connection in the handler signature

The 100-continue handler needs h11 for three operations: sending the
100 `InformationalResponse`, reading body `Data` events, and sending
the final `Response`. These must go through h11 because the state
machine tracks what operations are legal at each point — after sending
100, h11 unblocks body reads; without it, the handler would need to
reimplement that state tracking.

Existing misbehavior handlers (truncated_body, malformed_chunks)
deliberately bypass h11 for responses because they send malformed data
that h11 wouldn't allow. They ignore the h11_conn parameter. This is
the right design: well-formed multi-phase interactions use h11,
deliberate protocol violations use raw sockets.

### Why not a handler wrapper or new handler type

Alternatives considered:

- **Two-phase handlers** (pre-body / post-body callbacks): More
  structured, but the phases don't compose well. 100-continue has two
  phases, but future handlers (e.g., slow body reads for backpressure
  tests) might have different shapes.

- **WireConnection wrapper** around socket + h11: Adds a new
  abstraction with methods like `send_100()`, `read_body()`. Cleaner
  API, but premature — we don't yet know what other mid-request
  interactions we'll need. Passing h11.Connection directly is less
  opinionated and lets each handler compose h11 primitives as needed.

The fourth-parameter approach is the minimal change that unblocks
100-continue without constraining future handler designs.

### What the captured request looks like for 100-continue

WireServer's `_handle_connection` captures the request (method, path,
headers) and enqueues it before calling the handler. For 100-continue,
the body is empty at capture time (PAUSED state). The handler reads
the body afterward. This means `captured.body` will be empty — the
test asserts body content via the response echo, not the captured
request.

If target-side body assertions are needed later, the handler could
update the captured request's body after reading it, or enqueue a
second capture. For now, the echo-based assertion is sufficient.
