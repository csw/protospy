# HTTP proxy conformance tests

See:
- Overview: [docs/conformance-tests.md](../docs/conformance-tests.md)
- Test catalog: [docs/conformance-test-catalog.md](../docs/conformance-test-catalog.md)

## Development

### Tests

This uses pytest for tests.

To run tests against a specific proxy, use the custom `--proxy` option for pytest: `--proxy caddy` or `--proxy haproxy`.

To print the conformance findings as well as the test results, use the `--findings` option.

When run with stdlib logging at the DEBUG level (for the `conformance` logger specifically), this prints the HTTP interactions. Specifically, the client-side request and response if it uses standard HTTP interactions via httpx rather than the low-level `h11_client`, and the request as seen at the target if it uses the high-level GoodServer target.To see them for a given test:

```shell
uv run pytest --log-level DEBUG -r A -k x-forwarded-for-append
```
