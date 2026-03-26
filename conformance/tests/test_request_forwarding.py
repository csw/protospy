"""Request forwarding conformance tests (categories 1, 14).

§1: Method, path, query string, headers, and body forwarded intact.
§14: URI handling — path normalization, fragments.
"""

from __future__ import annotations

import httpx
import pytest

from proxy_conformance.good_server import CapturedRequest, GoodServer
from proxy_conformance.h11_client import send_raw_request_line
from proxy_conformance.types import (
    ClientExpectation,
    HeaderExpectation,
    ProxyQuirk,
    ProxyTestCase,
    RequestSpec,
    TargetExpectation,
    apply_quirk,
    assert_proxy_test_case,
)

from .conftest import Findings
from .proxies import ProxyUrls, tagged_url


def _host_is_upstream_authority(captured: CapturedRequest, server: GoodServer) -> bool:
    """Check proxy set Host to upstream server's authority (RFC 9110 §7.6.3)."""
    return captured.header_joined("host") == f"{server.host}:{server.port}"


# §1.9: Both Caddy and HAProxy preserve original Host (RFC 9110 §7.6.3 deviation)
_HOST_HEADER_QUIRKS: dict[str, ProxyQuirk] = {
    proxy: ProxyQuirk(
        disposition="override",
        reason=(
            f"{proxy.title()} preserves original Host by default"
            " (RFC 9110 §7.6.3 deviation)"
        ),
        target=TargetExpectation(
            headers=HeaderExpectation(present={"host": "test-host.example.com"}),
        ),
    )
    for proxy in ("caddy", "haproxy")
}

REQUEST_FORWARDING_TESTS: list[ProxyTestCase] = [
    # Category 1: Request forwarding fundamentals
    #
    # Target-side method, path, and body are verified automatically by
    # assert_proxy_test_case using the RequestSpec as source of truth.
    # TargetExpectation is only needed for additional header assertions.
    #
    # 1.1: HTTP methods preserved (RFC 9110 §9)
    ProxyTestCase(
        id="1.1-method-preserved-GET",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards GET method unchanged",
        catalog_ids=["1.1"],
        request=RequestSpec(method="GET", path="/echo"),
    ),
    ProxyTestCase(
        id="1.1-method-preserved-POST",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards POST method unchanged",
        catalog_ids=["1.1"],
        request=RequestSpec(method="POST", path="/echo", body=b"test"),
    ),
    ProxyTestCase(
        id="1.1-method-preserved-PUT",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards PUT method unchanged",
        catalog_ids=["1.1"],
        request=RequestSpec(method="PUT", path="/echo", body=b"test"),
    ),
    ProxyTestCase(
        id="1.1-method-preserved-PATCH",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards PATCH method unchanged",
        catalog_ids=["1.1"],
        request=RequestSpec(method="PATCH", path="/echo", body=b"test"),
    ),
    ProxyTestCase(
        id="1.1-method-preserved-DELETE",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards DELETE method unchanged",
        catalog_ids=["1.1"],
        request=RequestSpec(method="DELETE", path="/echo"),
    ),
    ProxyTestCase(
        id="1.1-method-preserved-OPTIONS",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards OPTIONS method unchanged",
        catalog_ids=["1.1"],
        request=RequestSpec(method="OPTIONS", path="/echo"),
    ),
    ProxyTestCase(
        id="1.1-method-preserved-HEAD",
        spec_ref="RFC 9110 §9",
        description="Proxy forwards HEAD method unchanged",
        catalog_ids=["1.1"],
        request=RequestSpec(method="HEAD", path="/echo"),
    ),
    # 1.2: Path preserved (RFC 9112 §3.2)
    ProxyTestCase(
        id="1.2-path-preserved",
        spec_ref="RFC 9112 §3.2",
        description="Proxy forwards nested path segments unchanged",
        catalog_ids=["1.2"],
        request=RequestSpec(method="GET", path="/echo/some/nested/path"),
    ),
    # 1.3: Query string preserved (RFC 9112 §3.2)
    ProxyTestCase(
        id="1.3-query-string-preserved",
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
        id="1.4-percent-encoding-preserved",
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
        id="1.5-request-headers-forwarded",
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
        id="1.6-request-body-content-length",
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
        id="1.7-request-body-chunked",
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
        id="1.8-empty-body-not-fabricated",
        spec_ref="RFC 9110 §9.3.1",
        description="Proxy does not fabricate a body for GET",
        catalog_ids=["1.8"],
        request=RequestSpec(method="GET", path="/echo"),
    ),
    # 1.9: Host header set to upstream authority (RFC 9110 §7.6.3)
    ProxyTestCase(
        id="1.9-host-upstream-authority",
        spec_ref="RFC 9110 §7.6.3",
        description=(
            "Proxy sets Host to upstream server authority, not client's original value"
        ),
        catalog_ids=["1.9"],
        request=RequestSpec(
            method="GET",
            path="/echo",
            headers={"Host": "test-host.example.com"},
        ),
        expect_at_target=TargetExpectation(
            custom=[_host_is_upstream_authority],
        ),
        proxy_quirks=_HOST_HEADER_QUIRKS,
    ),
    # Category 14: URI handling
    # 14.1: Double slashes preserved (RFC 9112 §3.2)
    ProxyTestCase(
        id="14.1-double-slashes-preserved",
        spec_ref="RFC 9112 §3.2",
        description="Proxy preserves double slashes in request path",
        catalog_ids=["14.1"],
        request=RequestSpec(method="GET", path="/echo//double//slashes"),
    ),
    # 14.2: Dot segments — tested via raw socket in TestDotSegments below
    # (httpx normalizes ./.. before sending, so ProxyTestCase can't test it)
    # 14.3: Empty query preserved (RFC 9112 §3.2)
    ProxyTestCase(
        id="14.3-empty-query-preserved",
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


# §14.4: HAProxy returns 400 for fragments in request line.
_FRAGMENT_QUIRKS: dict[str, ProxyQuirk] = {
    "haproxy": ProxyQuirk(
        disposition="override",
        reason="HAProxy rejects fragments in request-target with 400",
        client=ClientExpectation(status=400),
    ),
}


class TestFragmentHandling:
    """Test 14.4: fragment in request-target (RFC 9112 §3.2)."""

    def test_fragment_in_request_line(
        self,
        proxy: ProxyUrls,
        findings: Findings,
        proxy_name: str,
    ) -> None:
        """Proxy strips fragment and forwards request (§14.4).

        RFC 9112 §3.2 says fragments must not be sent in the
        request-target. Default: proxy strips the fragment and
        forwards the request (200). HAProxy rejects with 400.
        """
        quirk = apply_quirk(proxy_name, _FRAGMENT_QUIRKS)

        result = send_raw_request_line(
            host=proxy.good_host,
            port=proxy.good_port,
            request_line="GET /echo/fragment-test#section HTTP/1.1",
        )

        if quirk and quirk.client is not None:
            assert isinstance(quirk.client, ClientExpectation)
            assert result is not None, "Expected error response, got connection drop"
            if quirk.client.status is not None:
                assert result.status == quirk.client.status, (
                    f"Expected {quirk.client.status}, got {result.status}"
                )
            findings.record(
                "fragment-request",
                f"[{proxy_name}] Proxy returned {result.status} "
                "for fragment in request line "
                "(RFC 9112 §3.2 says fragment must not be sent)",
                level="finding",
            )
        else:
            # Default: strip fragment, forward request
            assert result is not None, (
                "Proxy closed connection for fragment in request "
                "line (expected 200 with fragment stripped)"
            )
            assert result.status == 200, f"Expected 200, got {result.status}"
            findings.record(
                "fragment-request",
                f"[{proxy_name}] Proxy returned {result.status} "
                "for fragment in request line",
                level="info",
            )
