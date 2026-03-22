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

from .conftest import ProxyUrls, _test_url

HOP_BY_HOP_TESTS: list[ProxyTestCase] = [
    ProxyTestCase(
        id="connection-header-stripped",
        spec_ref="RFC 9110 §7.6.1",
        description=(
            "Proxy removes the Connection header from the forwarded request; "
            "Connection is a hop-by-hop header that applies only to the "
            "client-proxy connection"
        ),
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
    ProxyTestCase(
        id="te-stripped",
        spec_ref="RFC 9110 §7.6.1",
        description=(
            "Proxy removes the TE header from the forwarded request; "
            "TE is a hop-by-hop header"
        ),
        request=RequestSpec(
            method="GET",
            path="/echo",
            headers={"TE": "trailers"},
        ),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                absent=["te"],
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
        proxy_quirks={
            "caddy": ProxyQuirk(
                disposition="override",
                reason=(
                    "Caddy does not strip the TE header from "
                    "forwarded requests (RFC 9110 §7.6.1 "
                    "requires removal)"
                ),
                target=TargetExpectation(),
            ),
        },
    ),
    ProxyTestCase(
        id="proxy-authorization-stripped",
        spec_ref="RFC 9110 §7.6.1",
        description=(
            "Proxy removes the Proxy-Authorization header from the "
            "forwarded request; Proxy-Authorization is a hop-by-hop "
            "header consumed between client and proxy"
        ),
        request=RequestSpec(
            method="GET",
            path="/echo",
            headers={"Proxy-Authorization": "Basic dGVzdDp0ZXN0"},
        ),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                absent=["proxy-authorization"],
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="response-hop-by-hop-stripped",
        spec_ref="RFC 9110 §7.6.1",
        description=(
            "Proxy removes hop-by-hop headers from the forwarded response; "
            "the target returns Connection and Keep-Alive headers via /headers "
            "endpoint, and the proxy should strip them before returning to client"
        ),
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
        _test_url(f"{proxy.good_url}{case.request.path}", case.id),
        headers=case.request.headers,
        content=case.request.body,
    )

    assert_proxy_test_case(response, good_server, case, proxy_name=proxy_name)
