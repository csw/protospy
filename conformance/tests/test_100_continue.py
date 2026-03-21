"""100-continue conformance tests.

Validates proxy and WireServer behaviour for requests carrying
Expect: 100-continue (RFC 9110 §10.1.1).
"""

from __future__ import annotations

import urllib.parse

from proxy_conformance.h11_client import send_with_expect_continue
from proxy_conformance.wire_server import WireServer

from .conftest import Findings, ProxyUrls, _test_url


class TestContinueIntegration:
    """Verify h11 client ↔ WireServer 100-continue works without a proxy."""

    def test_direct_to_wire_server(self, wire_server: WireServer) -> None:
        parsed = urllib.parse.urlparse(wire_server.url)
        assert parsed.hostname is not None
        assert parsed.port is not None
        result = send_with_expect_continue(
            host=parsed.hostname,
            port=parsed.port,
            path="/continue",
            body=b"direct test body",
        )
        assert result.got_100, "WireServer should send 100 Continue"
        assert result.final.status == 200
        assert result.final.body == b"direct test body"


class TestBasic100Continue:
    """Proxy handling of the basic 100-continue flow (catalog 8.1).

    RFC 9110 §10.1.1: client sends Expect: 100-continue, upstream
    sends 100, client sends body, upstream sends final response.
    The proxy should forward the 100 to the client.
    """

    def test_body_forwarded(
        self,
        proxy: ProxyUrls,
        findings: Findings,
        proxy_name: str,
    ) -> None:
        result = send_with_expect_continue(
            host=proxy.wire_host,
            port=proxy.wire_port,
            path=_test_url("/continue", "basic-100-continue"),
            body=b"the request body",
        )

        assert result.final.status == 200
        assert result.final.body == b"the request body"

        # Did the proxy forward the 100?
        if result.got_100:
            findings.record(
                "basic-100-continue",
                f"[{proxy_name}] Proxy forwarded 100 Continue to client",
                level="info",
            )
        else:
            findings.record(
                "basic-100-continue",
                f"[{proxy_name}] Proxy absorbed 100 Continue "
                "(sent final response directly)",
                level="finding",
            )
