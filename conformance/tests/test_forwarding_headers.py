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

from .proxies import ProxyUrls, tagged_url

FORWARDING_HEADER_TESTS: list[ProxyTestCase] = [
    ProxyTestCase(
        id="x-forwarded-for-added",
        spec_ref="MDN: X-Forwarded-For",
        description=(
            "Proxy adds X-Forwarded-For header containing the client IP "
            "when none is present in the request"
        ),
        request=RequestSpec(method="GET", path="/echo"),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                contains={"x-forwarded-for": "127.0.0.1"},
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="x-forwarded-for-appended",
        spec_ref="MDN: X-Forwarded-For",
        description=(
            "Proxy appends client IP to existing X-Forwarded-For header, "
            "preserving the original value"
        ),
        request=RequestSpec(
            method="GET",
            path="/echo",
            headers={"X-Forwarded-For": "10.0.0.1"},
        ),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                contains={"x-forwarded-for": "10.0.0.1"},
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="x-forwarded-proto-added",
        spec_ref="MDN: X-Forwarded-Proto",
        description=(
            "Proxy adds X-Forwarded-Proto header with the original request scheme "
            "(http in this test)"
        ),
        request=RequestSpec(method="GET", path="/echo"),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                contains={"x-forwarded-proto": "http"},
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
        id="x-forwarded-host-added",
        spec_ref="MDN: X-Forwarded-Host",
        description=(
            "Proxy adds X-Forwarded-Host header with the original request host"
        ),
        request=RequestSpec(method="GET", path="/echo"),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                contains={"x-forwarded-host": "127.0.0.1"},
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
