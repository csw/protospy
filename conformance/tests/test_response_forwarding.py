"""Response forwarding conformance tests (category 2)."""

import httpx
import pytest

from proxy_conformance.good_server import GoodServer
from proxy_conformance.types import (
    ClientExpectation,
    HeaderExpectation,
    ProxyTestCase,
    RequestSpec,
    assert_proxy_test_case,
)

from .conftest import ProxyUrls, _test_url

RESPONSE_FORWARDING_TESTS = [
    ProxyTestCase(
        id="2.1-2xx-status-forwarded",
        spec_ref="RFC 9110 §15.3",
        description="Proxy forwards 2xx response status to client",
        request=RequestSpec(method="GET", path="/echo"),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="2.2-3xx-status-forwarded",
        spec_ref="RFC 9110 §15.4",
        description="Proxy forwards 3xx response status and Location header to client",
        request=RequestSpec(method="GET", path="/redirect/301?to=/destination"),
        expect_at_client=ClientExpectation(
            status=301,
            headers=HeaderExpectation(present={"location": "/destination"}),
        ),
    ),
    ProxyTestCase(
        id="2.3-4xx-status-forwarded",
        spec_ref="RFC 9110 §15.5",
        description="Proxy forwards 4xx response status to client",
        request=RequestSpec(method="GET", path="/status/404"),
        expect_at_client=ClientExpectation(status=404),
    ),
    ProxyTestCase(
        id="2.4-5xx-status-forwarded",
        spec_ref="RFC 9110 §15.6",
        description="Proxy forwards 5xx response status to client",
        request=RequestSpec(method="GET", path="/status/503"),
        expect_at_client=ClientExpectation(status=503),
    ),
    ProxyTestCase(
        id="2.5-response-headers-forwarded",
        spec_ref="RFC 9110 §7",
        description="Proxy forwards response headers to client",
        request=RequestSpec(
            method="GET", path="/headers?X-Custom-Response=conformance-value"
        ),
        expect_at_client=ClientExpectation(
            status=200,
            headers=HeaderExpectation(
                present={"x-custom-response": "conformance-value"}
            ),
        ),
    ),
    ProxyTestCase(
        id="2.6-response-body-content-length",
        spec_ref="RFC 9112 §6.2",
        description="Proxy forwards response body with Content-Length",
        request=RequestSpec(method="GET", path="/body/content-length?size=1000"),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="2.7-response-body-chunked",
        spec_ref="RFC 9112 §7.1",
        description="Proxy forwards chunked response body",
        request=RequestSpec(method="GET", path="/body/chunked?size=1000"),
        expect_at_client=ClientExpectation(status=200),
    ),
]


@pytest.mark.parametrize(
    "case",
    RESPONSE_FORWARDING_TESTS,
    ids=lambda c: c.id,
)
def test_response_forwarding(
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
        follow_redirects=False,  # important for 2.2
    )

    assert_proxy_test_case(response, good_server, case, proxy_name=proxy_name)
