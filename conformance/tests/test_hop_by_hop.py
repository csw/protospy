"""Hop-by-hop header handling conformance tests (category 3, RFC 9110 §7.6.1).

Hop-by-hop headers are consumed by the proxy and MUST NOT be forwarded to the
target or client. This module tests the removal of all defined hop-by-hop headers
and ensures end-to-end headers are properly preserved.
"""

from __future__ import annotations

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

HOP_BY_HOP_TESTS: list[ProxyTestCase] = [
    ProxyTestCase(
        id="connection-header-stripped",
        spec_ref="RFC 9110 §7.6.1",
        description=(
            "Proxy removes the Connection header from the forwarded request; "
            "Connection is a hop-by-hop header that applies only to the "
            "client-proxy connection"
        ),
        catalog_ids=["3.1"],
        request=RequestSpec(
            method="GET",
            path="/echo",
            headers={"Connection": "keep-alive"},
        ),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                absent=["connection"],
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
        proxy_quirks={
            "haproxy": ProxyQuirk(
                disposition="override",
                reason=(
                    "HAProxy in keep-alive mode injects its own Keep-Alive for "
                    "upstream connection management (RFC 9110 §7.6.1 is silent on "
                    "this). Cannot distinguish injected from forwarded with absent[] "
                    "model. Configure with `option http-server-close` to align."
                ),
                target=TargetExpectation(),
            ),
        },
    ),
    ProxyTestCase(
        id="connection-named-headers-stripped",
        spec_ref="RFC 9110 §7.6.1",
        description=(
            "Proxy removes headers named in the Connection header value; "
            "Connection: X-Custom-Hop tells the proxy that X-Custom-Hop is "
            "hop-by-hop and must not be forwarded"
        ),
        catalog_ids=["3.2"],
        request=RequestSpec(
            method="GET",
            path="/echo",
            headers={"Connection": "X-Custom-Hop", "X-Custom-Hop": "some-value"},
        ),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                absent=["x-custom-hop"],
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
        proxy_quirks={
            # Caddy strips the Connection header itself but does not strip
            # headers listed in its value (RFC 9110 §7.6.1 requires both).
            "caddy": ProxyQuirk(
                disposition="override",
                reason=(
                    "Caddy strips the Connection header but does not strip "
                    "headers named in its value (e.g. X-Custom-Hop). "
                    "RFC 9110 §7.6.1 requires both."
                ),
                target=TargetExpectation(),
            ),
            "haproxy": ProxyQuirk(
                disposition="override",
                reason=(
                    "HAProxy does not strip headers named in the Connection "
                    "header value (e.g. X-Custom-Hop). RFC 9110 §7.6.1 "
                    "requires this but HAProxy does not implement it."
                ),
                target=TargetExpectation(),
            ),
        },
    ),
    ProxyTestCase(
        id="keep-alive-stripped",
        spec_ref="RFC 9110 §7.6.1",
        description=(
            "Proxy removes the Keep-Alive header from the forwarded request; "
            "Keep-Alive is a hop-by-hop header that applies only to the "
            "client-proxy connection"
        ),
        catalog_ids=["3.3"],
        request=RequestSpec(
            method="GET",
            path="/echo",
            headers={"Keep-Alive": "timeout=5"},
        ),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                absent=["keep-alive"],
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
        proxy_quirks={
            "haproxy": ProxyQuirk(
                disposition="override",
                reason=(
                    "HAProxy in keep-alive mode injects its own Keep-Alive "
                    "header for upstream connection management. Cannot "
                    "distinguish injected from forwarded with absent[] model."
                ),
                target=TargetExpectation(),
            ),
        },
    ),
    # TE and Proxy-Authorization are omitted from the hard-assertion list.
    # RFC 9110 §7.6.1 lists both as hop-by-hop, but other sections explicitly
    # permit forwarding:
    #   - TE: §10.1.4 "A proxy MAY forward a TE … with a value of 'trailers'"
    #   - Proxy-Authorization: §11.7.1 "A proxy MAY relay the credentials …
    #     to the next proxy"
    # Neither Caddy nor HAProxy strips them.  See findings-based tests below.
    ProxyTestCase(
        id="response-hop-by-hop-stripped",
        spec_ref="RFC 9110 §7.6.1",
        description=(
            "Proxy removes hop-by-hop headers from the forwarded response; "
            "the target returns Connection and Keep-Alive headers via /headers "
            "endpoint, and the proxy should strip them before returning to client"
        ),
        catalog_ids=["3.6"],
        request=RequestSpec(
            method="GET",
            path="/headers?Connection=keep-alive&Keep-Alive=timeout%3D5",
        ),
        expect_at_target=TargetExpectation(),
        expect_at_client=ClientExpectation(
            status=200,
            headers=HeaderExpectation(
                absent=["connection", "keep-alive"],
            ),
        ),
        proxy_quirks={
            "haproxy": ProxyQuirk(
                disposition="override",
                reason=(
                    "HAProxy does not strip hop-by-hop headers from upstream "
                    "responses by default; requires explicit "
                    "`http-response del-header` rules."
                ),
                client=ClientExpectation(status=200),
            ),
        },
    ),
    ProxyTestCase(
        id="end-to-end-headers-not-stripped",
        spec_ref="RFC 9110 §7.6.1",
        description=(
            "Proxy preserves end-to-end headers (not in the hop-by-hop list); "
            "headers like X-Connection-Info and Authorization are end-to-end "
            "and must be forwarded intact"
        ),
        catalog_ids=["3.7"],
        request=RequestSpec(
            method="GET",
            path="/echo",
            headers={
                "X-Connection-Info": "metadata",
                "Authorization": "Bearer token123",
            },
        ),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                present={
                    "x-connection-info": "metadata",
                    "authorization": "Bearer token123",
                },
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
]


@pytest.mark.parametrize(
    "case",
    HOP_BY_HOP_TESTS,
    ids=lambda c: c.id,
)
def test_hop_by_hop(
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
# Findings-based: headers that §7.6.1 calls hop-by-hop but other sections
# explicitly permit forwarding.
# ---------------------------------------------------------------------------


def test_te_header_handling(
    proxy: ProxyUrls,
    good_server: GoodServer,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """TE header forwarding behaviour (RFC 9110 §7.6.1 vs §10.1.4).

    §7.6.1 lists TE as hop-by-hop, but §10.1.4 says a proxy MAY forward
    TE with a value of "trailers".  Neither Caddy nor HAProxy strips it.
    """
    response = client.get(
        tagged_url(f"{proxy.good_url}/echo", "te-header-handling"),
        headers={"TE": "trailers"},
    )
    assert response.status_code == 200

    captured = good_server.last_request()
    te_values = captured.header_values("te")
    if te_values:
        findings.record(
            "te-header-handling",
            f"[{proxy_name}] Proxy forwarded TE: trailers "
            "(permitted by RFC 9110 §10.1.4)",
            level="info",
        )
    else:
        findings.record(
            "te-header-handling",
            f"[{proxy_name}] Proxy stripped TE header (strict §7.6.1 removal)",
            level="info",
        )


def test_proxy_authorization_handling(
    proxy: ProxyUrls,
    good_server: GoodServer,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy-Authorization forwarding behaviour (RFC 9110 §7.6.1 vs §11.7.1).

    §7.6.1 lists Proxy-Authorization as hop-by-hop, but §11.7.1 says a
    proxy MAY relay credentials to the next proxy.  Neither Caddy nor
    HAProxy strips it.
    """
    response = client.get(
        tagged_url(
            f"{proxy.good_url}/echo",
            "proxy-authorization-handling",
        ),
        headers={"Proxy-Authorization": "Basic dGVzdDp0ZXN0"},
    )
    assert response.status_code == 200

    captured = good_server.last_request()
    pa_values = captured.header_values("proxy-authorization")
    if pa_values:
        findings.record(
            "proxy-authorization-handling",
            f"[{proxy_name}] Proxy forwarded Proxy-Authorization "
            "(permitted by RFC 9110 §11.7.1)",
            level="info",
        )
    else:
        findings.record(
            "proxy-authorization-handling",
            f"[{proxy_name}] Proxy stripped Proxy-Authorization "
            "(strict §7.6.1 removal)",
            level="info",
        )
