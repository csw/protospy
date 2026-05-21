# HTTP proxy conformance tests

See:
- Overview: [docs/conformance-tests.md](../docs/conformance-tests.md)
- Test catalog: [docs/conformance-test-catalog.md](../docs/conformance-test-catalog.md)

## Architecture

The suite runs the same battery of HTTP-behavior tests against multiple proxies — Caddy, HAProxy, and protospy — to verify protospy is a correct transparent reverse proxy. The reference proxies validate both protospy and the tests themselves: any deviation from their behavior signals either a protospy bug or a broken test.

**The conformance tests in `tests/` are the primary deliverable.** `tests/test_hop_by_hop.py`, `test_forwarding_headers.py`, `test_chunked_edge_cases.py`, and the other `test_*.py` files are the product of this subproject — the HTTP conformance coverage. `tests/` also contains two infrastructure unit tests (`test_assertions.py`, `test_good_server.py`) and two infrastructure support files (`conftest.py`, `proxies.py`) that are not conformance tests.

The `src/proxy_conformance/` package provides the harness: target servers (`GoodServer`, `WireServer`, `H2cServer`, `GrpcServer`), the structured `ProxyTestCase`/`ProxyQuirk` assertion model, a low-level h11 client for protocol-violation tests, and port-allocation utilities.

Each test is parametrized over the selected proxy list (`--proxy`). For each proxy, a subprocess is started, requests are sent through it, and both the client-side response and the captured request at the target server are asserted.

For code-level details — module roles, fixture wiring, file map, channel taxonomy — see [ARCHITECTURE.md](ARCHITECTURE.md).

## Development

### Running tests

This uses pytest for tests.

To run tests against a specific proxy, use the custom `--proxy` option for pytest: `--proxy caddy` or `--proxy haproxy`.

To run tests against protospy (always built with `cargo build`):

```shell
uv run pytest --proxy protospy
```

To show a summary of failing tests against protospy, without error details:
```shell
uv run pytest --proxy protospy --tb=no --show-capture no --disable-warnings -rf
```

Or a summary of all tests:
```shell
uv run pytest --proxy protospy --tb=no --show-capture no --disable-warnings -rA
```

Use `--proxy all` to run against all managed proxies (caddy, haproxy, protospy). This excludes `protospy-ext` (see below).

To print the conformance findings as well as the test results, use the `--findings` option.

To see the actual HTTP requests and responses on stderr, in the style of `curl -v`, use the `--show-http` option. To see this for tests which pass, also specify `-rP`. For example:

```shell
uv run pytest -rP --proxy caddy --show-http -k upstream_unreachable
```

### Running against a pre-started protospy instance

`--proxy protospy-ext` connects to a protospy process you started yourself, rather than having the test harness spawn one. This is useful during active protospy development when you want full control over the binary, configuration, and logs.

Default ports:

| Channel | Target server (started by test suite) | Protospy frontend |
|---------|--------------------------------------|-------------------|
| good    | 7300                                 | 7400              |
| wire    | 7301                                 | 7401              |
| dead    | *(not managed by test suite)*        | 7402              |

Start protospy in one terminal:

```shell
PROXY__GOOD__PORT=7400 \
PROXY__GOOD__TARGET=127.0.0.1:7300 \
PROXY__WIRE__PORT=7401 \
PROXY__WIRE__TARGET=127.0.0.1:7301 \
PROXY__DEAD__PORT=7402 \
PROXY__DEAD__TARGET=127.0.0.1:7399 \
WEB=0 \
cargo run
```

Run the tests in another:

```shell
cd conformance
uv run pytest --proxy protospy-ext -q
```

No extra flags are needed when using the default ports. All port defaults can be overridden:

```shell
uv run pytest --proxy protospy-ext \
  --good-target-port 8300 \
  --wire-target-port 8301 \
  --protospy-ext-good-port 8400 \
  --protospy-ext-wire-port 8401 \
  --protospy-ext-dead-port 8402
```

`--proxy protospy-ext` automatically disables parallel test execution (`-n auto`) because the target servers bind fixed ports that cannot be shared across multiple worker processes.

When run with stdlib logging at the DEBUG level (for the `conformance` logger specifically), this prints the HTTP interactions. Specifically, the client-side request and response if it uses standard HTTP interactions via httpx rather than the low-level `h11_client`, and the request as seen at the target if it uses the high-level GoodServer target.To see them for a given test:

```shell
uv run pytest --log-level DEBUG -r A -k x-forwarded-for-append
```

### Marking expected failures

For tests not using the ProxyTestCase mechanism, expected failures can be indicated for a particular proxy using the `xfail_for` fixture, e.g.

```python
@pytest.mark.xfail_for("protospy")
def test_websocket_bidirectional(
```
