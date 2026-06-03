# Testing guidelines

You MUST follow these guidelines when writing or maintaining tests, particularly for the conformance test suite.

For **UI tests** (Vitest + Playwright under `ui/`), see `ui/CLAUDE.md` for the project split (`.test.ts` → node, `.test.tsx` → jsdom), shared fixture location (`src/test/fixtures.ts`), jest-dom matchers, coverage-threshold policy, and the `browser/` injection harness (note: Playwright tests live in `ui/browser/` rather than `ui/e2e/` — they verify UI rendering, not full-stack flow).

**UI code changes require tests.** Every change to `ui/src/` or `ui/browser/` must include corresponding tests — unit, component, or browser depending on the code changed. See the "Test-Writing Requirements" section of `ui/CLAUDE.md` for the full policy, including which test type to use for which kind of change.

**LLM visual review is a separate layer from the deterministic browser tests — they don't replace each other.** The `ui/browser/` Playwright suite (including `browser/design-tokens.spec.ts`) makes *repeatable, deterministic* assertions about rendered properties and behaviour. LLM-based **visual review** — the `visual-review` subagent and the `/design-review` skill, judged against `docs/frontend-dod.md` — assesses *holistic* visual quality across the fixture matrix (layout, hierarchy, clipping, both themes at 1280/1440/1920). Deterministic tests can't judge whether a layout "looks right," and a visual review isn't a repeatable assertion. A UI change needs both: write/extend browser tests for what you changed, and let the visual review cover the look. See the root `CLAUDE.md` "Visual design reviews" section for how the review runs.

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

### Failures are your fault until proven otherwise

When anything fails during your work — a test, a build, a lint or type check, a runtime crash, or a fixture or harness that will not load — **assume your changes caused it**. This applies to every kind of failure, not only test failures.
Do not dismiss a failure as "pre-existing" or "flaky" without concrete
evidence — specifically:

- You reproduced the failure on a clean checkout of main (no local
  changes), OR
- The failure is in a test completely unrelated to your changes AND you
  can identify the exact external condition causing it (a network
  timeout, a port conflict, etc.), OR
- The failure is a missing external prerequisite you cannot provision —
  e.g. Elasticsearch down for the flix e2e suite, the conformance suite's
  live proxy infra not running, or Playwright browsers not installed.
  Surface it to the user per quality-gates.md rather than treating it as
  your bug; do not silently work around it.

"The test was last modified a while ago" is not evidence of flakiness.
"It passed on the second run" is not evidence of flakiness. "It only
fails under load / in the full suite / with more workers" is not
evidence of flakiness — that's evidence of a real bug (likely a shared
state or ordering dependency your change introduced). The UI test suite
in particular has been highly reliable — there are no known flaky tests.

**Do not theorize — investigate.** When anything fails, read the failure
output, look at what the failing check or test asserts, and trace backward
to find the actual cause. Common agent failure mode: constructing a plausible-
sounding narrative ("load-sensitive," "worker contention," "race
condition in the test framework") without reading the test code or
checking whether the failure reproduces deterministically. If you
can't explain *which line of your code* caused the failure and *why*,
you haven't finished investigating.

### Reproducing CI-only timing failures locally

CI runners have fewer CPU resources than development machines, which can surface
race conditions that never reproduce locally. Constrain the test's CPU to
approximate that pressure — the command depends on your platform.

**Linux (the `cs` container):** pin the process tree to a single CPU at idle
scheduling priority with `taskset` + `chrt` (both in the image, no privileges
needed):

```bash
taskset -c 0 chrt --idle 0 uv run pytest -q --proxy protospy -k 'test_name'
```

**macOS (the host):** use `taskpolicy -b` to constrain to background QoS
(efficiency cores only, lowest scheduling priority):

```bash
taskpolicy -b uv run pytest -q --proxy protospy -k 'test_name'
```

`taskpolicy -b` typically produces a 4-6x slowdown; the Linux single-core
constraint is comparable but not separately calibrated. Either is useful for:
- Verifying a flaky-test fix actually holds under resource pressure
- Reproducing timing-dependent failures (BrokenPipeError, connection races) that only appear in CI
- Stress-testing with a loop: `for i in $(seq 1 30); do <constrain> uv run pytest ...; done`

Note: on the host macOS sandbox, `taskpolicy -b` must run with
`dangerouslyDisableSandbox: true` (the sandbox blocks `setpriority()`) — see
`host-sandbox.md`. The Linux command in the `cs` container needs no override.
