# Plan: Proxy Quirks Mechanism

> **For agentic workers:** Use superpowers:subagent-driven-development or
> superpowers:executing-plans to implement this plan. Use Haiku subagents for
> mechanical refactoring steps (renaming, import updates, moving code).
> Steps use checkbox syntax for tracking.

**Goal:** Replace the ad-hoc `proxy_overrides` dict and `_EXPECTED_STATUS` dict
with a unified `ProxyQuirk` mechanism that can express how specific proxies
deviate from RFC-correct behavior, using pytest's native `xfail` and `skip`
marks.

**Context:** The conformance suite tests proxy behavior against RFC
expectations. Reference proxies (Caddy, HAProxy) deviate in known ways — wrong
status codes, connection drops, non-deterministic race conditions. The current
code handles this with two separate mechanisms that don't compose. The new
system should make deviations declarative, visible in pytest output, and
easy to extend when adding new proxies (especially protospy).

See: `docs/process/findings-caddy-pool-state-behavior.md` for the Caddy race
condition that motivates the `xfail` disposition.

---

## Data model

### ProxyQuirk

```python
@dataclass
class ProxyQuirk:
    """How a specific proxy deviates from RFC-correct expectations."""

    disposition: Literal["override", "xfail", "skip"]
    reason: str
    client: ClientExpectation | None = None
    target: TargetExpectation | None = None
```

**Dispositions:**

- `override` — the proxy's behavior is different but valid (or at least
  understood). Replace the RFC-correct expectation with the quirk's
  `client` and/or `target` fields. The test passes if the proxy matches
  the override. Example: HAProxy injecting its own Keep-Alive header to
  the upstream (valid hop-by-hop behavior, but different from Caddy).

- `xfail` — the proxy's behavior is wrong per the RFC, and we know it.
  Run the test with the RFC-correct expectation but mark it as expected
  failure via `pytest.xfail(reason)`. The `client`/`target` fields are
  unused. Example: Caddy returning 200 or 502 instead of 400 for an
  incomplete chunked request.

- `skip` — the test cannot run for this proxy (e.g., a feature the proxy
  doesn't support at all). Call `pytest.skip(reason)`.

### Integration with ProxyTestCase

Replace `proxy_overrides: dict[str, ClientExpectation | TargetExpectation | None]`
with `proxy_quirks: dict[str, ProxyQuirk]`.

`expect_at_client` and `expect_at_target` always express the RFC-correct
behavior. Quirks express deviations from that baseline.

---

## Steps

### Step 1: Define ProxyQuirk dataclass

- [ ] Add `ProxyQuirk` to `conformance/src/proxy_conformance/types.py`
- [ ] Add `proxy_quirks: dict[str, ProxyQuirk]` field to `ProxyTestCase`,
      defaulting to empty dict
- [ ] Keep `proxy_overrides` temporarily for backward compatibility (removed
      in step 4)

### Step 2: Update assertion helpers

- [ ] Modify `assert_proxy_test_case` to check `proxy_quirks` (preferred)
      before falling back to `proxy_overrides` (deprecated)
- [ ] For `override`: replace `effective_client`/`effective_target` with quirk
      fields where non-None, keep RFC-correct expectation where None
- [ ] For `xfail`: call `pytest.xfail(quirk.reason)` — this immediately marks
      the test as expected-failure without running the assertions. Use
      `strict=False` so unexpected passes show as XPASS (informational, not
      failure)
- [ ] For `skip`: call `pytest.skip(quirk.reason)`

### Step 3: Migrate happy-path tests

- [ ] Convert the HAProxy keep-alive override in `test_basic_proxy.py`
      (`hop-by-hop-removal` test case) from `proxy_overrides` to
      `proxy_quirks` with `disposition="override"`
- [ ] Verify all existing happy-path tests pass for both `--proxy caddy` and
      `--proxy haproxy`

### Step 4: Migrate protocol-error tests to ProxyTestCase

This is the larger change. `test_chunked_errors.py` and `test_bad_server.py`
currently don't use `ProxyTestCase` at all — they have manual assertion logic
and the `_EXPECTED_STATUS` dict.

**Consideration:** These tests use different clients (h11 raw sockets, httpx
with `send_expecting_error`) and handle connection drops (`result is None`).
`ProxyTestCase` currently assumes an httpx response. Two options:

  **A.** Extend `ProxyTestCase` and `assert_proxy_test_case` to handle
  `ProbeResult | RawResponse | None` in addition to `httpx.Response`. This
  unifies everything but adds complexity to the assertion helper.

  **B.** Use `ProxyQuirk` standalone (not embedded in `ProxyTestCase`) for
  protocol-error tests. The quirk data model is useful even without the full
  `ProxyTestCase` wrapper — tests can look up their quirk by proxy name and
  apply the disposition directly.

  Prefer **B** for now. Protocol-error tests have inherently different shapes
  (findings recording, connection-drop handling, target-forwarding checks).
  Forcing them into `ProxyTestCase` would require making the assertion helper
  overly polymorphic. Instead, define quirk dicts at the module level and
  apply dispositions manually:

  ```python
  _QUIRKS: dict[str, ProxyQuirk] = {
      "caddy": ProxyQuirk(
          disposition="xfail",
          reason="Race condition: returns 200 or 502, not 400 "
                 "(reverseproxy.go:653 context.Canceled short-circuit)",
      ),
      "haproxy": ProxyQuirk(
          disposition="override",
          reason="Drops connection without response (strict parser)",
          client=ClientExpectation(status=None),  # needs status: int | None
      ),
  }
  ```

  **Note on ClientExpectation.status:** Currently `int`. To express "connection
  drop" (no response at all), either:
  - Add `status: int | None = 200` where `None` means connection drop expected
  - Or add a separate `connection_drop: bool = False` field

  Prefer `status: int | None` — it's simpler and `None` already has the right
  semantics in `ProbeResult` and `RawResponse`.

- [ ] Add `status: int | None` support to `ClientExpectation` (change default
      from `200` to remain `200`, allow `None`)
- [ ] Create module-level `_QUIRKS` dicts in `test_chunked_errors.py` and
      `test_bad_server.py`
- [ ] Add a small helper (in `types.py` or the test modules) that applies a
      quirk disposition given the proxy name:
      ```python
      def apply_quirk(proxy_name: str, quirks: dict[str, ProxyQuirk]) -> ProxyQuirk | None:
          quirk = quirks.get(proxy_name)
          if quirk is None:
              return None
          if quirk.disposition == "skip":
              pytest.skip(quirk.reason)
          if quirk.disposition == "xfail":
              pytest.xfail(quirk.reason)
          return quirk  # disposition == "override"
      ```
- [ ] Replace `_EXPECTED_STATUS` usage and manual connection-drop handling
      with quirk lookups
- [ ] Remove `_EXPECTED_STATUS` dict

### Step 5: Remove proxy_overrides

- [ ] Remove `proxy_overrides` field from `ProxyTestCase`
- [ ] Remove the `proxy_overrides` handling code from `assert_proxy_test_case`
- [ ] Verify all tests still pass

### Step 6: Verify

- [ ] `uv run ruff check .` clean
- [ ] `uv run ruff format --check .` clean
- [ ] `uv run pyright .` clean
- [ ] `uv run pytest` passes for `--proxy caddy`
- [ ] `uv run pytest` passes for `--proxy haproxy`
- [ ] pytest output shows XFAIL for Caddy's incomplete-chunked-request test
- [ ] pytest output shows appropriate marks for HAProxy quirks
