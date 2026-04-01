# HTTP proxy conformance tests

See:
- Overview: [docs/conformance-tests.md](../docs/conformance-tests.md)
- Test catalog: [docs/conformance-test-catalog.md](../docs/conformance-test-catalog.md)

## Development

### Tests

This uses pytest for tests.

To run tests against a specific proxy, use the custom `--proxy` option for pytest: `--proxy caddy` or `--proxy haproxy`.

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
cargo run -- \
  --proxy=name=good,port=7400,target=127.0.0.1:7300 \
  --proxy=name=wire,port=7401,target=127.0.0.1:7301 \
  --proxy=name=dead,port=7402,target=127.0.0.1:7399
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
