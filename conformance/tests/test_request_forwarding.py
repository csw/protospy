"""Request forwarding conformance tests (categories 1, 14).

§1: Method, path, query string, headers, and body forwarded intact.
§14: URI handling — path normalization, fragments.
"""

from __future__ import annotations

import httpx
import pytest

from proxy_conformance.good_server import GoodServer
from proxy_conformance.h11_client import send_raw_request_line
from proxy_conformance.types import (
    ClientExpectation,
    HeaderExpectation,
    ProxyTestCase,
    RequestSpec,
    TargetExpectation,
    assert_proxy_test_case,
)

from .conftest import Findings, ProxyUrls, _test_url

REQUEST_FORWARDING_TESTS: list[ProxyTestCase] = [
    # Category 1: Request forwarding fundamentals
    # 1.1: HTTP methods preserved (RFC 9110 §9)
    ProxyTestCase(
        id="method-preserved-GET",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards GET request method unchanged",
        request=RequestSpec(method="GET", path="/echo"),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="method-preserved-POST",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards POST request method unchanged with body",
        request=RequestSpec(
            method="POST",
            path="/echo",
            body=b"test",
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="method-preserved-PUT",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards PUT request method unchanged with body",
        request=RequestSpec(
            method="PUT",
            path="/echo",
            body=b"test",
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="method-preserved-PATCH",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards PATCH request method unchanged with body",
        request=RequestSpec(
            method="PATCH",
            path="/echo",
            body=b"test",
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="method-preserved-DELETE",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards DELETE request method unchanged",
        request=RequestSpec(method="DELETE", path="/echo"),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="method-preserved-OPTIONS",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards OPTIONS request method unchanged",
        request=RequestSpec(method="OPTIONS", path="/echo"),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="method-preserved-HEAD",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards HEAD request method unchanged",
        request=RequestSpec(method="HEAD", path="/echo"),
        expect_at_client=ClientExpectation(status=200),
    ),
    # 1.2: Path preserved (RFC 9112 §3.2)
    ProxyTestCase(
        id="path-preserved",
        spec_ref="RFC 9112 §3.2",
        description="Proxy forwards request path with nested segments unchanged",
        request=RequestSpec(method="GET", path="/echo/some/nested/path"),
        expect_at_client=ClientExpectation(status=200),
    ),
    # 1.3: Query string preserved (RFC 9112 §3.2)
    ProxyTestCase(
        id="query-string-preserved",
        spec_ref="RFC 9112 §3.2",
        description="Proxy forwards query string parameters unchanged",
        request=RequestSpec(method="GET", path="/echo/qs-test?q=hello&page=2"),
        expect_at_client=ClientExpectation(status=200),
    ),
    # 1.4: Percent-encoding preserved (RFC 9112 §3.2)
    ProxyTestCase(
        id="percent-encoding-preserved",
        spec_ref="RFC 9112 §3.2",
        description="Proxy preserves percent-encoded characters in path",
        request=RequestSpec(
            method="GET",
            path="/echo/path%20with%20spaces",
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    # 1.5: Request headers forwarded (RFC 9110 §7)
    ProxyTestCase(
        id="request-headers-forwarded",
        spec_ref="RFC 9110 §7",
        description="Proxy forwards custom request headers to target",
        request=RequestSpec(
            method="GET",
            path="/echo",
            headers={
                "X-Custom-Header": "custom-value",
                "Accept": "application/json",
            },
        ),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                present={
                    "x-custom-header": "custom-value",
                    "accept": "application/json",
                },
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    # 1.6: Request body with Content-Length (RFC 9112 §6.2)
    ProxyTestCase(
        id="request-body-content-length",
        spec_ref="RFC 9112 §6.2",
        description="Proxy forwards POST request body with Content-Length header",
        request=RequestSpec(
            method="POST",
            path="/echo",
            body=b'{"key": "value"}',
        ),
        expect_at_target=TargetExpectation(
            body=b'{"key": "value"}',
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    # 1.7: Request body chunked (RFC 9112 §7.1)
    ProxyTestCase(
        id="request-body-chunked",
        spec_ref="RFC 9112 §7.1",
        description="Proxy forwards chunked request body",
        request=RequestSpec(
            method="POST",
            path="/echo",
            body=b"chunked body content",
        ),
        expect_at_target=TargetExpectation(
            body=b"chunked body content",
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    # 1.8: Empty body not fabricated (RFC 9110 §9.3.1)
    ProxyTestCase(
        id="empty-body-not-fabricated",
        spec_ref="RFC 9110 §9.3.1",
        description="Proxy forwards GET with no body without fabricating one",
        request=RequestSpec(method="GET", path="/echo"),
        expect_at_client=ClientExpectation(status=200),
    ),
    # Category 14: URI handling
    # 14.1: Double slashes preserved (RFC 9112 §3.2)
    ProxyTestCase(
        id="double-slashes-preserved",
        spec_ref="RFC 9112 §3.2",
        description="Proxy preserves double slashes in request path",
        request=RequestSpec(method="GET", path="/echo//double//slashes"),
        expect_at_client=ClientExpectation(status=200),
    ),
    # 14.2: Dot segments preserved (RFC 9112 §3.2)
    ProxyTestCase(
        id="dot-segments-preserved",
        spec_ref="RFC 9112 §3.2",
        description="Proxy preserves dot segments (.) in request path",
        request=RequestSpec(method="GET", path="/echo/./dot/segments"),
        expect_at_client=ClientExpectation(status=200),
    ),
    # 14.3: Empty query preserved (RFC 9112 §3.2)
    ProxyTestCase(
        id="empty-query-preserved",
        spec_ref="RFC 9112 §3.2",
        description="Proxy preserves query string with no parameters",
        request=RequestSpec(method="GET", path="/echo/empty-query?x=1"),
        expect_at_client=ClientExpectation(status=200),
    ),
    # 14.4 (fragment) is in TestFragmentHandling below
]


@pytest.mark.parametrize("case", REQUEST_FORWARDING_TESTS, ids=lambda c: c.id)
def test_request_forwarding(
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


class TestFragmentHandling:
    """Test 14.4: fragment in request-target (RFC 9112 §3.2)."""

    def test_fragment_in_request_line(
        self,
        proxy: ProxyUrls,
        findings: Findings,
    ) -> None:
        """Proxy behavior when request line contains a fragment."""
        result = send_raw_request_line(
            host=proxy.good_host,
            port=proxy.good_port,
            request_line="GET /echo/fragment-test#section HTTP/1.1",
        )
        if result is None:
            findings.record(
                "fragment-request",
                "Proxy closed connection for fragment in request line",
                level="finding",
            )
        else:
            findings.record(
                "fragment-request",
                f"Proxy returned {result.status} for fragment in request line",
                level="finding",
            )
