# Testing guidelines

You MUST follow these guidelines when writing or maintaining tests, particularly for the conformance test suite.

## Conformance tests

The conformance test suite needs to be able to run against a pre-existing protospy instance, for the sake of debuggability. You can assume it will have an appropriate configuration in that case, but the test suite must not rely on starting protospy itself. (Protospy is not yet implemented, but allow for this in test suite design.)

The conformance tests themselves need to be in sync with the definitions in `../conformance-test-catalog.md`, and cite the specification (RFC or de facto) defining the behavior they test. When a test covers behaviors from several categories, e.g. `test_request_forwarding.py`'s tests covering 6.1-6.4 as well, this must be noted in the file where the tests would otherwise be.

## Test assertions

Make sure that a test verifies the behavior being tested. For instance, it is not sufficient to check for a success response if the purpose of the test is to verify some property of a request arriving at the target server.

## Execution time

The test suite should run in under 15 seconds. Parallelize if needed. Avoid writing tests that would block for more than a few seconds when they're passing. If a default timeout is too long, use a test configuration with a shorter timeout.

## Timing and Determinism

Tests should be deterministic. Prefer explicit synchronization to relying on timeouts that 'should work' or on timing measurements. NEVER write a test that will block indefinitely if an invariant isn't met. Synchronization in a test MUST have a reasonable timeout (60 seconds max), and MUST be checked for timeout so that the test will fail.

Flaky tests are unacceptable.
