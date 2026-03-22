"""Via header conformance tests (category 4, RFC 9110 §7.6.3)."""

from __future__ import annotations

import httpx
import pytest

from proxy_conformance.good_server import GoodServer
from proxy_conformance.types import (
    ClientExpectation,
    HeaderExpectation,
    ProxyTestCase,
    RequestSpec,
    TargetExpectation,
    assert_proxy_test_case,
)

from .conftest import ProxyUrls, _test_url

VIA_TESTS: list[ProxyTestCase] = [
    ProxyTestCase(
        id="via-added-to-request",
        spec_ref="RFC 9110 §7.6.3",
        description="Proxy adds Via header to forwarded request (no upstream Via)",
        request=RequestSpec(method="GET", path="/echo"),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(contains={"via": "1.1"}),
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="via-appended-to-request",
        spec_ref="RFC 9110 §7.6.3",
        description=(
            "Proxy appends Via header to forwarded request (upstream Via present)"
        ),
        request=RequestSpec(
            method="GET", path="/echo", headers={"Via": "1.0 upstream-proxy"}
        ),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(contains={"via": "1.1"}),
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="via-added-to-response",
        spec_ref="RFC 9110 §7.6.3",
        description="Proxy adds Via header to response (no upstream Via in response)",
        request=RequestSpec(method="GET", path="/echo"),
        expect_at_target=TargetExpectation(),
        expect_at_client=ClientExpectation(
            status=200,
            headers=HeaderExpectation(contains={"via": "1.1"}),
        ),
    ),
    ProxyTestCase(
        id="via-appended-to-response",
        spec_ref="RFC 9110 §7.6.3",
        description=(
            "Proxy appends Via header to response (upstream Via present in response)"
        ),
        request=RequestSpec(method="GET", path="/headers?Via=1.1+backend"),
        expect_at_target=TargetExpectation(),
        expect_at_client=ClientExpectation(
            status=200,
            headers=HeaderExpectation(contains={"via": "1.1"}),
        ),
    ),
]


@pytest.mark.parametrize(
    "case",
    VIA_TESTS,
    ids=lambda c: c.id,
)
def test_via_header(
    proxy: ProxyUrls,
    good_server: GoodServer,
    client: httpx.Client,
    case: ProxyTestCase,
    proxy_name: str,
) -> None:
    response = client.request(
        case.request.method,
        _test_url(f"{proxy.good_url}{case.request.path}", case.id),
        headers=case.request.headers,
        content=case.request.body,
    )

    assert_proxy_test_case(response, good_server, case, proxy_name=proxy_name)
