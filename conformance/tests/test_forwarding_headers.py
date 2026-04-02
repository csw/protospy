"""Forwarding identification header tests (category 5).

Tests for X-Forwarded-* headers (X-Forwarded-For, X-Forwarded-Proto,
X-Forwarded-Host) that proxies use to identify the client and original
request scheme/host to the upstream server.
"""

import httpx
import pytest

from proxy_conformance.good_server import GoodServer
from proxy_conformance.types import (
    ClientExpectation,
    HeaderExpectation,
    ProxyQuirk,
    ProxyTestCase,
    RequestSpec,
    TargetExpectation,
    assert_proxy_test_case,
)

from .conftest import Findings
from .proxies import ProxyUrls, tagged_url

FORWARDING_HEADER_TESTS: list[ProxyTestCase] = [
    ProxyTestCase(
        id="5.1-x-forwarded-for-added",
        spec_ref="MDN: X-Forwarded-For",
        description=(
            "Proxy adds X-Forwarded-For header containing the client IP "
            "when none is present in the request"
        ),
        catalog_ids=["5.1"],
        request=RequestSpec(method="GET", path="/echo"),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                present={"x-forwarded-for": "127.0.0.1"},
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="5.2-x-forwarded-for-appended",
        spec_ref="MDN: X-Forwarded-For",
        description=(
            "Proxy appends client IP to existing X-Forwarded-For header, "
            "preserving the original value"
        ),
        catalog_ids=["5.2"],
        request=RequestSpec(
            method="GET",
            path="/echo",
            headers={"X-Forwarded-For": "10.0.0.1"},
        ),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                contains={"x-forwarded-for": "10.0.0.1, 127.0.0.1"},
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="5.3-x-forwarded-proto-added",
        spec_ref="MDN: X-Forwarded-Proto",
        description=(
            "Proxy adds X-Forwarded-Proto header with the original request scheme "
            "(http in this test)"
        ),
        catalog_ids=["5.3"],
        request=RequestSpec(method="GET", path="/echo"),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                present={"x-forwarded-proto": "http"},
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
        proxy_quirks={
            "haproxy": ProxyQuirk(
                disposition="override",
                reason=(
                    "HAProxy does not add X-Forwarded-Proto without explicit "
                    "reqadd directive"
                ),
                target=TargetExpectation(),
            ),
        },
    ),
    ProxyTestCase(
        id="5.4-x-forwarded-host-added",
        spec_ref="MDN: X-Forwarded-Host",
        description=(
            "Proxy adds X-Forwarded-Host header with the original request host"
        ),
        catalog_ids=["5.4"],
        request=RequestSpec(
            method="GET",
            path="/echo",
            headers={"Host": "test-proxy-client.example.com"},
        ),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                present={"x-forwarded-host": "test-proxy-client.example.com"},
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
        proxy_quirks={
            "haproxy": ProxyQuirk(
                disposition="override",
                reason=(
                    "HAProxy does not add X-Forwarded-Host without explicit config"
                ),
                target=TargetExpectation(),
            ),
        },
    ),
]


@pytest.mark.parametrize(
    "case",
    FORWARDING_HEADER_TESTS,
    ids=lambda c: c.id,
)
def test_forwarding_headers(
    proxy: ProxyUrls,
    good_server: GoodServer,
    client: httpx.Client,
    case: ProxyTestCase,
    proxy_name: str,
) -> None:
    response = client.request(
        case.request.method,
        tagged_url(f"{proxy.good_url}{case.request.path}", case.id),
        headers=case.request.headers,
        content=case.request.body,
    )

    assert_proxy_test_case(response, good_server, case, proxy_name=proxy_name)


# ---------------------------------------------------------------------------
# Findings-based: existing X-Forwarded-Proto / X-Forwarded-Host
# ---------------------------------------------------------------------------


def test_x_forwarded_proto_existing(
    proxy: ProxyUrls,
    good_server: GoodServer,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """X-Forwarded-Proto with pre-existing value (§5.5).

    When the client already sends X-Forwarded-Proto, the proxy may
    preserve, replace, or append. This test records observed behavior.
    """
    response = client.get(
        tagged_url(
            f"{proxy.good_url}/echo",
            "x-forwarded-proto-existing",
        ),
        headers={"X-Forwarded-Proto": "https"},
    )
    assert response.status_code == 200

    captured = good_server.last_request()
    xfp = captured.header_joined("x-forwarded-proto")
    if xfp and "https" in xfp:
        findings.record(
            "x-forwarded-proto-existing",
            (f"[{proxy_name}] Proxy preserved original X-Forwarded-Proto: {xfp!r}"),
            level="info",
        )
    else:
        findings.record(
            "x-forwarded-proto-existing",
            (f"[{proxy_name}] Proxy replaced X-Forwarded-Proto: {xfp!r}"),
            level="finding",
        )


def test_x_forwarded_host_existing(
    proxy: ProxyUrls,
    good_server: GoodServer,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """X-Forwarded-Host with pre-existing value (§5.6).

    When the client already sends X-Forwarded-Host, the proxy may
    preserve, replace, or append. This test records observed behavior.
    """
    response = client.get(
        tagged_url(
            f"{proxy.good_url}/echo",
            "x-forwarded-host-existing",
        ),
        headers={
            "X-Forwarded-Host": "previous.example.com",
        },
    )
    assert response.status_code == 200

    captured = good_server.last_request()
    xfh = captured.header_joined("x-forwarded-host")
    if xfh and "previous.example.com" in xfh:
        findings.record(
            "x-forwarded-host-existing",
            (f"[{proxy_name}] Proxy preserved original X-Forwarded-Host: {xfh!r}"),
            level="info",
        )
    else:
        findings.record(
            "x-forwarded-host-existing",
            (f"[{proxy_name}] Proxy replaced X-Forwarded-Host: {xfh!r}"),
            level="finding",
        )
