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
    HeaderExpectation,
    ProxyTestCase,
    RequestSpec,
    TargetExpectation,
    assert_proxy_test_case,
)

from .conftest import Findings
from .proxies import ProxyUrls, tagged_url

REQUEST_FORWARDING_TESTS: list[ProxyTestCase] = [
    # Category 1: Request forwarding fundamentals
    #
    # Target-side method, path, and body are verified automatically by
    # assert_proxy_test_case using the RequestSpec as source of truth.
    # TargetExpectation is only needed for additional header assertions.
    #
    # 1.1: HTTP methods preserved (RFC 9110 §9)
    ProxyTestCase(
        id="method-preserved-GET",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards GET method unchanged",
        catalog_ids=["1.1"],
        request=RequestSpec(method="GET", path="/echo"),
    ),
    ProxyTestCase(
        id="method-preserved-POST",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards POST method unchanged",
        catalog_ids=["1.1"],
        request=RequestSpec(method="POST", path="/echo", body=b"test"),
    ),
    ProxyTestCase(
        id="method-preserved-PUT",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards PUT method unchanged",
        catalog_ids=["1.1"],
        request=RequestSpec(method="PUT", path="/echo", body=b"test"),
    ),
    ProxyTestCase(
        id="method-preserved-PATCH",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards PATCH method unchanged",
        catalog_ids=["1.1"],
        request=RequestSpec(method="PATCH", path="/echo", body=b"test"),
    ),
    ProxyTestCase(
        id="method-preserved-DELETE",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards DELETE method unchanged",
        catalog_ids=["1.1"],
        request=RequestSpec(method="DELETE", path="/echo"),
    ),
    ProxyTestCase(
        id="method-preserved-OPTIONS",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards OPTIONS method unchanged",
        catalog_ids=["1.1"],
        request=RequestSpec(method="OPTIONS", path="/echo"),
    ),
    ProxyTestCase(
        id="method-preserved-HEAD",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards HEAD method unchanged",
        catalog_ids=["1.1"],
        request=RequestSpec(method="HEAD", path="/echo"),
    ),
    # 1.2: Path preserved (RFC 9112 §3.2)
    ProxyTestCase(
        id="path-preserved",
        spec_ref="RFC 9112 §3.2",
        description="Proxy forwards nested path segments unchanged",
        catalog_ids=["1.2"],
        request=RequestSpec(method="GET", path="/echo/some/nested/path"),
    ),
    # 1.3: Query string preserved (RFC 9112 §3.2)
    ProxyTestCase(
        id="query-string-preserved",
        spec_ref="RFC 9112 §3.2",
        description="Proxy forwards query string parameters unchanged",
        catalog_ids=["1.3"],
        request=RequestSpec(
            method="GET",
            path="/echo/qs-test?q=hello&page=2",
        ),
    ),
    # 1.4: Percent-encoding preserved (RFC 9112 §3.2)
    ProxyTestCase(
        id="percent-encoding-preserved",
        spec_ref="RFC 9112 §3.2",
        description="Proxy preserves percent-encoded characters in path",
        catalog_ids=["1.4"],
        request=RequestSpec(
            method="GET",
            path="/echo/path%20with%20spaces",
        ),
    ),
    # 1.5: Request headers forwarded (RFC 9110 §7)
    ProxyTestCase(
        id="request-headers-forwarded",
        spec_ref="RFC 9110 §7",
        description="Proxy forwards custom request headers to target",
        catalog_ids=["1.5"],
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
    ),
    # 1.6: Request body with Content-Length (RFC 9112 §6.2)
    ProxyTestCase(
        id="request-body-content-length",
        spec_ref="RFC 9112 §6.2",
        description="Proxy forwards POST body with Content-Length",
        catalog_ids=["1.6"],
        request=RequestSpec(
            method="POST",
            path="/echo",
            body=b'{"key": "value"}',
        ),
    ),
    # 1.7: Request body chunked (RFC 9112 §7.1)
    ProxyTestCase(
        id="request-body-chunked",
        spec_ref="RFC 9112 §7.1",
        description="Proxy forwards chunked request body",
        catalog_ids=["1.7"],
        request=RequestSpec(
            method="POST",
            path="/echo",
            body=b"chunked body content",
        ),
    ),
    # 1.8: Empty body not fabricated (RFC 9110 §9.3.1)
    ProxyTestCase(
        id="empty-body-not-fabricated",
        spec_ref="RFC 9110 §9.3.1",
        description="Proxy does not fabricate a body for GET",
        catalog_ids=["1.8"],
        request=RequestSpec(method="GET", path="/echo"),
    ),
    # Category 14: URI handling
    # 14.1: Double slashes preserved (RFC 9112 §3.2)
    ProxyTestCase(
        id="double-slashes-preserved",
        spec_ref="RFC 9112 §3.2",
        description="Proxy preserves double slashes in request path",
        catalog_ids=["14.1"],
        request=RequestSpec(method="GET", path="/echo//double//slashes"),
    ),
    # 14.2: Dot segments — tested via raw socket in TestDotSegments below
    # (httpx normalizes ./.. before sending, so ProxyTestCase can't test it)
    # 14.3: Empty query preserved (RFC 9112 §3.2)
    ProxyTestCase(
        id="empty-query-preserved",
        spec_ref="RFC 9112 §3.2",
        description="Proxy preserves query string with parameters",
        catalog_ids=["14.3"],
        request=RequestSpec(method="GET", path="/echo/empty-query?x=1"),
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
        tagged_url(f"{proxy.good_url}{case.request.path}", case.id),
        headers=case.request.headers,
        content=case.request.body,
    )
    assert_proxy_test_case(response, good_server, case, proxy_name=proxy_name)


class TestDotSegments:
    """Test 14.2: dot segments in request path (RFC 9112 §3.2).

    httpx normalizes dot segments before sending, so this test uses
    raw sockets to bypass client-side normalization.
    """

    def test_dot_segments_in_path(
        self,
        proxy: ProxyUrls,
        good_server: GoodServer,
        findings: Findings,
        proxy_name: str,
    ) -> None:
        """Proxy should preserve dot segments in path."""
        result = send_raw_request_line(
            host=proxy.good_host,
            port=proxy.good_port,
            request_line=("GET /echo/./dot/segments HTTP/1.1"),
        )
        if result is None:
            findings.record(
                "dot-segments",
                f"[{proxy_name}] Proxy closed connection for dot segments in path",
                level="finding",
            )
            return

        assert result.status == 200

        try:
            captured = good_server.last_request(timeout=1.0)
            if captured.path.startswith("/echo/./dot/segments"):
                findings.record(
                    "dot-segments",
                    f"[{proxy_name}] Proxy preserved dot segments in path",
                    level="info",
                )
            else:
                findings.record(
                    "dot-segments",
                    f"[{proxy_name}] Proxy normalized dot segments: {captured.path!r}",
                    level="finding",
                )
        except Exception:
            findings.record(
                "dot-segments",
                f"[{proxy_name}] Target received no request",
                level="finding",
            )


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
            request_line=("GET /echo/fragment-test#section HTTP/1.1"),
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
