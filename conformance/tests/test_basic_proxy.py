"""Happy-path proxy conformance tests.

Each test case validates a specific RFC requirement using:
- httpx as the client
- The proxy under test (selected by --proxy)
- GoodServer as the target (with out-of-band request capture)
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

from .conftest import ProxyUrls, _test_url

BASIC_PROXY_TESTS = [
    ProxyTestCase(
        id="get-simple",
        spec_ref="RFC 9110 §9.3.1",
        description="Proxy forwards a simple GET and returns the response",
        request=RequestSpec(method="GET", path="/echo/hello"),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="via-header-added",
        spec_ref="RFC 9110 §7.6.3",
        description=(
            "Proxy appends a Via header indicating the protocol version "
            "and proxy identity"
        ),
        request=RequestSpec(method="GET", path="/echo/via-test"),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                contains={"via": "1.1"},
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="via-header-appended",
        spec_ref="RFC 9110 §7.6.3",
        description=(
            "Proxy appends a Via header indicating the protocol version "
            "and proxy identity, when one is already present"
        ),
        request=RequestSpec(
            method="GET", path="/echo/via-test", headers={"Via": "1.0 Apache"}
        ),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                contains={"via": "1.1"},
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="hop-by-hop-removal",
        spec_ref="RFC 9110 §7.6.1",
        description=(
            "Proxy removes hop-by-hop headers (Connection, Keep-Alive) "
            "from the forwarded request"
        ),
        request=RequestSpec(
            method="GET",
            path="/echo/hop-test",
            headers={"Connection": "keep-alive", "Keep-Alive": "timeout=5"},
        ),
        expect_at_target=TargetExpectation(
            headers=HeaderExpectation(
                absent=["keep-alive"],
            ),
        ),
        expect_at_client=ClientExpectation(status=200),
        proxy_quirks={
            # HAProxy operating in keep-alive mode with its upstream may
            # legitimately inject its own Keep-Alive header into the forwarded
            # request to negotiate connection parameters for the
            # HAProxy→upstream hop (RFC 9110 §7.6.1 is silent on this; the
            # header is hop-by-hop and governs that specific connection).
            # This is distinct from non-conformantly *forwarding* the client's
            # Keep-Alive, and is valid proxy behaviour.
            #
            # We cannot distinguish injected from forwarded using the current
            # assertion model (absent[] checks header name, not value), so we
            # skip the target assertion for HAProxy rather than suppressing its
            # upstream connection management with del-header.
            #
            # To make the proxies behave identically here, configure HAProxy
            # with `option http-server-close` (disables upstream keep-alive).
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
        id="post-body-forwarded",
        spec_ref="RFC 9110 §9.3.3",
        description="Proxy forwards POST request body to the target intact",
        request=RequestSpec(
            method="POST",
            path="/echo/body-test",
            headers={"Content-Type": "application/json"},
            body=b'{"key": "value"}',
        ),
        expect_at_target=TargetExpectation(
            body=b'{"key": "value"}',
        ),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="head-request",
        spec_ref="RFC 9110 §9.3.2",
        description=(
            "Proxy forwards HEAD; response has no body; "
            "out-of-band capture records the request"
        ),
        request=RequestSpec(method="HEAD", path="/echo/head-test"),
        expect_at_client=ClientExpectation(status=200),
    ),
]


@pytest.mark.parametrize(
    "case",
    BASIC_PROXY_TESTS,
    ids=lambda c: c.id,
)
def test_basic_proxy(
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
