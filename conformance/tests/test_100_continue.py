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


class TestUpstreamIgnoresExpect:
    """Proxy handling when upstream ignores Expect, sends final response (catalog 8.2).

    RFC 9110 §10.1.1: an upstream MAY ignore Expect: 100-continue and send
    the final response directly. The proxy must forward it to the client.
    """

    def test_final_response_forwarded(
        self,
        proxy: ProxyUrls,
        findings: Findings,
        proxy_name: str,
    ) -> None:
        result = send_with_expect_continue(
            host=proxy.wire_host,
            port=proxy.wire_port,
            path=_test_url("/continue/skip-100", "upstream-ignores-expect"),
            body=b"the request body",
        )

        assert result.final.status == 200

        if result.got_100:
            findings.record(
                "upstream-ignores-expect",
                f"[{proxy_name}] Proxy generated its own 100 Continue before "
                "upstream responded (RFC-compliant intermediary behaviour)",
                level="info",
            )
        else:
            findings.record(
                "upstream-ignores-expect",
                f"[{proxy_name}] Proxy did not send 100 Continue to client "
                "(forwarded final 200 directly)",
                level="info",
            )


class TestUpstreamRejectsExpect:
    """Proxy handling when upstream rejects with 417 Expectation Failed (catalog 8.3).

    RFC 9110 §10.1.1: upstream may send 417 to reject the Expect header.
    The proxy must forward the 417 to the client without forwarding the body.
    """

    def test_417_forwarded(
        self,
        proxy: ProxyUrls,
        findings: Findings,
        proxy_name: str,
    ) -> None:
        result = send_with_expect_continue(
            host=proxy.wire_host,
            port=proxy.wire_port,
            path=_test_url("/continue/reject", "upstream-rejects-expect"),
            body=b"the request body",
        )

        assert result.final.status == 417

        if result.got_100:
            findings.record(
                "upstream-rejects-expect",
                f"[{proxy_name}] Proxy sent 100 Continue to client before "
                "forwarding 417 from upstream",
                level="finding",
            )
        else:
            findings.record(
                "upstream-rejects-expect",
                f"[{proxy_name}] Proxy forwarded 417 without sending 100 to client",
                level="info",
            )


class TestClientSendsBodyEarly:
    """Client sends body without waiting for 100 Continue (catalog 8.4).

    RFC 9110 §10.1.1 allows clients to send Expect: 100-continue but
    proceed without waiting. The proxy and upstream should handle the
    body regardless.
    """

    def test_body_received_after_early_send(
        self,
        proxy: ProxyUrls,
        findings: Findings,
        proxy_name: str,
    ) -> None:
        body = b"the request body"
        result = send_with_expect_continue(
            host=proxy.wire_host,
            port=proxy.wire_port,
            path=_test_url("/continue", "client-sends-body-early"),
            body=body,
            wait_for_100=False,
        )

        assert result.final.status == 200
        assert result.final.body == body

        if result.got_100:
            findings.record(
                "client-sends-body-early",
                f"[{proxy_name}] Proxy sent 100 Continue even after client "
                "sent body without waiting",
                level="info",
            )
        else:
            findings.record(
                "client-sends-body-early",
                f"[{proxy_name}] Proxy did not send 100 Continue "
                "(client sent body early, proxy forwarded response directly)",
                level="info",
            )
