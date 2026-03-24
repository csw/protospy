# Testing guidelines

You MUST follow these guidelines when writing or maintaining tests, particularly for the conformance test suite.

## Conformance tests

The conformance test suite needs to be able to run against a pre-existing protospy instance, for the sake of debuggability. You can assume it will have an appropriate configuration in that case, but the test suite must not rely on starting protospy itself. (Protospy is not yet implemented, but allow for this in test suite design.)

The conformance tests themselves need to be in sync with the definitions in `../conformance-test-catalog.md`, and cite the specification (RFC or de facto) defining the behavior they test. When a test covers behaviors from several categories, e.g. `test_request_forwarding.py`'s tests covering 6.1-6.4 as well, this must be noted in the file where the tests would otherwise be.

Table-driven test cases using `ProxyTestCase` have IDs. These should have a prefix of the first catalog ID or range governing them, followed by a descriptive slug, like `5.1-x-forwarded-for-added`.

## Test assertions

Make sure that a test verifies the behavior being tested. For instance, it is not sufficient to check for a success response if the purpose of the test is to verify some property of a request arriving at the target server.

### Every behavioral claim must be verified

If a test or quirk claims a proxy exhibits specific behavior (e.g., "strips trailers", "rejects with 400", "does not forward the request"), that claim must be checked by an assertion. Recording a finding that says "proxy stripped trailer X" without verifying the trailer is actually absent is insufficient. Concretely:

- If a quirk says trailers are stripped, assert the trailer header is absent at the target (`HeaderExpectation(absent=[...])`).
- If a quirk says the proxy returns a specific status, assert that status via `assert_probe_result` or `_assert_raw_response`.
- If the default expectation is that no request reaches the target, use `assert_probe_target` with `TargetExpectation(no_request=True)`.
- If a quirk overrides target-side behavior, set `target=TargetExpectation(...)` on the `ProxyQuirk` and apply it.

### Uniform quirk application in probe tests

When a probe test has both client-side and target-side expectations, apply quirks uniformly to both. The pattern is:

1. Call `apply_quirk()` to get the override (if any).
2. Determine `effective_client` from `quirk.client` or the default.
3. Determine `effective_target` from `quirk.target` or the default.
4. Assert client side with `assert_probe_result` (or `_assert_raw_response`).
5. Assert target side with `assert_probe_target`.
6. Record findings noting any RFC deviation.

See `docs/conformance-tests.md` for the full assertion policy.

## Execution time

The test suite should run in under 15 seconds. Parallelize if needed. Avoid writing tests that would block for more than a few seconds when they're passing. If a default timeout is too long, use a test configuration with a shorter timeout.

## Timing and Determinism

Tests should be deterministic. Prefer explicit synchronization to relying on timeouts that 'should work' or on timing measurements. NEVER write a test that will block indefinitely if an invariant isn't met. Synchronization in a test MUST have a reasonable timeout (60 seconds max), and MUST be checked for timeout so that the test will fail.

Flaky tests are unacceptable.
