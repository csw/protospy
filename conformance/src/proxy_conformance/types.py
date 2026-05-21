"""Test case dataclasses and assertion helpers for proxy conformance tests.

Assertion policy: every test must assert for every proxy. Default expectations
reflect RFC-correct / protospy-desired behavior. Reference proxies that deviate
use ProxyQuirk overrides — the override is still asserted, validating that the
proxy behaves as documented. Findings record the delta from RFC alongside
assertions; they are observational annotations, not replacements.

See docs/conformance-tests.md for the full policy.
"""

from __future__ import annotations

import logging
import queue
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

import httpx
import pytest

from proxy_conformance import httpx_util
from proxy_conformance.captured import CapturedRequest
from proxy_conformance.good_server import GoodServer
from proxy_conformance.targets import proxy_family

log = logging.getLogger("conformance")

type CustomTargetExpectation = Callable[[CapturedRequest, GoodServer], bool]


@dataclass
class RequestSpec:
    """What the test client sends to the proxy."""

    method: str = "GET"
    path: str = "/"
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes | None = None


@dataclass
class HeaderExpectation:
    """Assertions about HTTP headers.

    - present: header must exist with this exact value (case-insensitive name)
    - contains: header must exist and its value must contain this substring
    - absent: header must not exist
    - count: header must appear exactly this many times
    """

    present: dict[str, str] = field(default_factory=dict)
    contains: dict[str, str] = field(default_factory=dict)
    absent: list[str] = field(default_factory=list)
    count: dict[str, int] = field(default_factory=dict)


@dataclass
class TargetExpectation:
    """What the target server should observe in the forwarded request.

    Method, path, and body are checked automatically by assert_proxy_test_case
    using the RequestSpec as the source of truth. Fields here are for
    additional assertions (headers) or overrides (body, no_request).
    """

    headers: HeaderExpectation = field(default_factory=HeaderExpectation)
    body: bytes | None = None  # Override expected body (default: from RequestSpec)
    no_request: bool = False
    custom: list[CustomTargetExpectation] = field(default_factory=list)


@dataclass
class ClientExpectation:
    """What the test client should observe in the proxy's response."""

    status: int | None = 200
    status_in: set[int] | None = None
    headers: HeaderExpectation = field(default_factory=HeaderExpectation)
    body: bytes | None = None
    body_contains: bytes | None = None


@dataclass
class ConnectionDrop:
    """Expected outcome: proxy closes connection without responding."""

    pass


type Outcome = ClientExpectation | ConnectionDrop
"""A single expected test outcome: either an HTTP response or a connection drop."""


@dataclass
class ProxyQuirk:
    """How a specific proxy deviates from RFC-correct expectations.

    Dispositions:
    - "override": proxy behavior is different but valid. Replace the RFC-correct
      expectation with the quirk's client/target fields where non-None.
    - "xfail": proxy behavior is wrong per RFC, and we know it. Marks the test
      as expected-failure via pytest.xfail(reason).
    - "skip": test cannot run for this proxy. Calls pytest.skip(reason).

    See docs/conformance-tests.md for the full assertion policy.
    """

    disposition: Literal["override", "xfail", "skip"]
    reason: str
    client: Outcome | list[Outcome] | None = None
    target: TargetExpectation | None = None


@dataclass
class ProxyTestCase:
    """A single proxy conformance test case."""

    id: str
    spec_ref: str
    description: str
    request: RequestSpec
    catalog_ids: list[str] = field(default_factory=list)
    expect_at_target: TargetExpectation = field(default_factory=TargetExpectation)
    expect_at_client: ClientExpectation = field(default_factory=ClientExpectation)
    proxy_quirks: dict[str, ProxyQuirk] = field(default_factory=dict)
    """Per-proxy behavioral deviations from RFC-correct expectations.

    See ProxyQuirk for disposition semantics.
    """


@dataclass
class ProbeResult:
    """Result from send_expecting_error — a response or a connection drop.

    status is None when the proxy dropped the connection without responding.
    body and headers are empty in that case.
    """

    status: int | None
    body: bytes
    headers: dict[str, list[str]]


def assert_headers(
    actual: dict[str, list[str]],
    expected: HeaderExpectation,
    context: str = "",
) -> None:
    """Assert that actual headers satisfy the expectation.

    Args:
        actual: Headers as {lowercase_name: [values...]}.
        expected: The header expectation to check against.
        context: Label for assertion messages (e.g., "target" or "client").
    """
    prefix = f"[{context}] " if context else ""

    for name, value in expected.present.items():
        key = name.lower()
        assert key in actual, f"{prefix}Expected header {name!r} to be present"
        actual_values = actual[key]
        assert value in actual_values, (
            f"{prefix}Header {name!r}: expected {value!r} to be among {actual_values!r}"
        )

    for name, substring in expected.contains.items():
        key = name.lower()
        assert key in actual, f"{prefix}Expected header {name!r} to be present"
        joined = ", ".join(actual[key])
        assert substring in joined, (
            f"{prefix}Header {name!r}: expected substring {substring!r} in {joined!r}"
        )

    for name in expected.absent:
        assert name.lower() not in actual, (
            f"{prefix}Header {name!r} should be absent but was found"
        )

    for name, expected_count in expected.count.items():
        key = name.lower()
        actual_count = len(actual.get(key, []))
        assert actual_count == expected_count, (
            f"{prefix}Header {name!r}: expected {expected_count} occurrence(s), "
            f"got {actual_count}"
        )


def normalize_httpx_headers(
    headers: httpx.Headers | dict[str, str | list[str]],
) -> dict[str, list[str]]:
    """Convert httpx.Headers to the dict[str, list[str]] format.

    Accepts httpx.Headers or a regular dict.
    """
    result: dict[str, list[str]] = {}
    if isinstance(headers, httpx.Headers):
        for name, value in headers.multi_items():
            result.setdefault(name.lower(), []).append(value)
    else:
        for name, value in headers.items():
            key = name.lower()
            if isinstance(value, list):
                result[key] = value
            else:
                result.setdefault(key, []).append(value)
    return result


def send_expecting_error(
    client: httpx.Client,
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    content: bytes | None = None,
) -> ProbeResult:
    """Send a request where the proxy may return an error or drop the connection.

    Returns a ProbeResult whose status is None if the proxy dropped the connection
    without sending any response (httpx.RemoteProtocolError), or the HTTP status
    code otherwise.
    """
    try:
        response = client.request(method, url, headers=headers or {}, content=content)
        return ProbeResult(
            status=response.status_code,
            body=response.content,
            headers=normalize_httpx_headers(response.headers),
        )
    except httpx.RemoteProtocolError:
        return ProbeResult(status=None, body=b"", headers={})


def _matches_outcome(result: ProbeResult, outcome: Outcome) -> bool:
    """Check if a probe result matches a single expected outcome."""
    if isinstance(outcome, ConnectionDrop):
        return result.status is None
    # ClientExpectation
    if result.status is None:
        return False
    if outcome.status_in is not None:
        return result.status in outcome.status_in
    if outcome.status is not None:
        return result.status == outcome.status
    return True


def assert_probe_result(
    result: ProbeResult,
    expected: Outcome | list[Outcome],
    *,
    test_id: str = "",
) -> None:
    """Assert that a probe result matches one of the expected outcomes.

    If expected is a single Outcome, the result must match it.
    If expected is a list, the result must match at least one entry.

    Each Outcome is either:
    - ConnectionDrop: matches if result.status is None
    - ClientExpectation: matches if result.status satisfies status/status_in
    """
    prefix = f"[{test_id}] " if test_id else ""
    outcomes = expected if isinstance(expected, list) else [expected]

    for outcome in outcomes:
        if _matches_outcome(result, outcome):
            return

    # Build a readable failure message
    actual = "connection drop" if result.status is None else f"status {result.status}"
    expected_parts: list[str] = []
    for outcome in outcomes:
        if isinstance(outcome, ConnectionDrop):
            expected_parts.append("connection drop")
        elif outcome.status_in is not None:
            expected_parts.append(f"status in {sorted(outcome.status_in)}")
        elif outcome.status is not None:
            expected_parts.append(f"status {outcome.status}")
    expected_desc = " or ".join(expected_parts) or "unknown"
    pytest.fail(f"{prefix}Got {actual}, expected {expected_desc}")


def assert_client_response(
    response: httpx.Response,
    expected: ClientExpectation,
    case_id: str = "",
) -> None:
    """Assert that a client response satisfies a ClientExpectation."""

    prefix = f"[{case_id}] " if case_id else ""

    if expected.status_in is not None:
        assert response.status_code in expected.status_in, (
            f"{prefix}Expected status in {expected.status_in!r}, "
            f"got {response.status_code}"
        )
    elif expected.status is not None:
        assert response.status_code == expected.status, (
            f"{prefix}Expected status {expected.status}, got {response.status_code}"
        )

    client_headers = normalize_httpx_headers(response.headers)
    assert_headers(client_headers, expected.headers, context="client")

    if expected.body is not None:
        assert response.content == expected.body, (
            f"{prefix}Body mismatch: expected {expected.body!r}, "
            f"got {response.content!r}"
        )

    if expected.body_contains is not None:
        assert expected.body_contains in response.content, (
            f"{prefix}Body does not contain {expected.body_contains!r}"
        )


def assert_proxy_test_case(
    response: httpx.Response,
    good_server: GoodServer,
    case: ProxyTestCase,
    proxy_name: str = "",
) -> None:
    """Assert both client-side and target-side expectations for a proxy test case.

    When proxy_name is provided and case.proxy_quirks has an entry for it,
    the quirk disposition determines behavior: skip, xfail, or override
    the RFC-correct expectations with proxy-specific values.
    """
    effective_client = case.expect_at_client
    effective_target = case.expect_at_target
    quirk = _resolve_quirk(proxy_name, case.proxy_quirks)
    if quirk is not None:
        if quirk.disposition == "skip":
            pytest.skip(quirk.reason)
        elif quirk.disposition == "xfail":
            pytest.xfail(quirk.reason)
        else:  # override
            if quirk.client is not None:
                if not isinstance(quirk.client, ClientExpectation):
                    msg = (
                        f"ProxyTestCase quirk for {proxy_name!r} uses "
                        f"ConnectionDrop or list, but assert_proxy_test_case "
                        f"requires a single ClientExpectation"
                    )
                    raise TypeError(msg)
                effective_client = quirk.client
            if quirk.target is not None:
                effective_target = quirk.target

    if log.getEffectiveLevel() <= logging.DEBUG:
        # print request and response
        log.debug(
            "HTTP headers:\n"
            + httpx_util.dump_request(response.request)
            + "\n"
            + httpx_util.dump_response(response)
        )

    assert_client_response(response, effective_client, case_id=case.id)

    if effective_target.no_request:
        try:
            good_server.requests.get(timeout=0.2)
            assert False, f"[{case.id}] Expected no request at target, but one arrived"  # noqa: B011
        except queue.Empty:
            pass
    else:
        captured = good_server.last_request()

        if log.getEffectiveLevel() <= logging.DEBUG:
            # print request and response
            log.debug("Request at target:\n" + captured.debug_str())

        # Method must always match the request spec.
        assert captured.method == case.request.method, (
            f"[{case.id}] Target method mismatch: "
            f"expected {case.request.method!r}, "
            f"got {captured.method!r}"
        )

        # Path: the captured path includes the _test= query param
        # appended by _test_url, so check it starts with the
        # request path.
        assert captured.path.startswith(case.request.path), (
            f"[{case.id}] Target path mismatch: "
            f"expected prefix {case.request.path!r}, "
            f"got {captured.path!r}"
        )

        assert_headers(
            captured.headers,
            effective_target.headers,
            context="target",
        )

        # Body: use TargetExpectation.body if set, otherwise
        # derive from RequestSpec (None body → expect empty).
        expected_body = effective_target.body
        if expected_body is None:
            expected_body = case.request.body or b""
        assert captured.body == expected_body, (
            f"[{case.id}] Target body mismatch: "
            f"expected {expected_body!r}, "
            f"got {captured.body!r}"
        )

        for cb in effective_target.custom:
            assert cb(captured, good_server), (
                f"[{case.id}] Custom expectation {cb.__name__!r} failed"
            )


def assert_probe_target(
    good_server: GoodServer,
    expected: TargetExpectation,
    *,
    test_id: str = "",
    timeout: float = 0.5,
) -> CapturedRequest | None:
    """Assert target-side expectations for a probe test.

    Checks whether a request arrived at the target and validates headers
    and body against the expectation. Returns the captured request if one
    arrived, or None if no_request was expected and confirmed.

    Raises AssertionError if the expectation is violated.
    """
    prefix = f"[{test_id}] " if test_id else ""

    if expected.no_request:
        try:
            good_server.requests.get(timeout=timeout)
            pytest.fail(f"{prefix}Expected no request at target, but one arrived")
        except queue.Empty:
            return None

    try:
        captured = good_server.last_request(timeout=timeout)
    except queue.Empty:
        pytest.fail(f"{prefix}Expected request at target, but none arrived")
        raise  # unreachable; helps pyright see captured is bound

    assert_headers(
        captured.headers,
        expected.headers,
        context=f"{prefix}target" if prefix else "target",
    )

    if expected.body is not None:
        assert captured.body == expected.body, (
            f"{prefix}Target body mismatch: "
            f"expected {expected.body!r}, got {captured.body!r}"
        )

    return captured


def _resolve_quirk(proxy_name: str, quirks: dict[str, ProxyQuirk]) -> ProxyQuirk | None:
    """Look up a quirk by concrete proxy name, then by family name.

    The family fallback lets a single ``proxy_quirks={"protospy": ...}``
    entry apply to every protospy variant (bypass, capture, ext) without
    forcing test authors to enumerate them.
    """
    if not proxy_name:
        return None
    quirk = quirks.get(proxy_name)
    if quirk is not None:
        return quirk
    family = proxy_family(proxy_name)
    if family is not None and family != proxy_name:
        return quirks.get(family)
    return None


def apply_quirk(proxy_name: str, quirks: dict[str, ProxyQuirk]) -> ProxyQuirk | None:
    """Apply a quirk for the given proxy name.

    For "skip": calls pytest.skip(reason) immediately (does not return).
    For "xfail": calls pytest.xfail(reason) immediately (does not return).
    For "override": returns the quirk for the caller to act on.
    Returns None if no quirk is defined for this proxy.

    Lookup tries the concrete proxy name first, then the family name
    (e.g. a quirk keyed on ``"protospy"`` matches ``proxy_name`` of
    ``"protospy-bypass"`` or ``"protospy-capture"``).
    """
    quirk = _resolve_quirk(proxy_name, quirks)
    if quirk is None:
        return None
    if quirk.disposition == "skip":
        pytest.skip(quirk.reason)
    if quirk.disposition == "xfail":
        pytest.xfail(quirk.reason)
    return quirk  # disposition == "override"
