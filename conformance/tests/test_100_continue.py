"""100-continue conformance tests.

Validates proxy and WireServer behaviour for requests carrying
Expect: 100-continue (RFC 9110 §10.1.1).
"""

from __future__ import annotations

import socket
import threading
import urllib.parse

from proxy_conformance.h11_client import (
    _parse_raw_response,
    send_with_expect_continue,
)
from proxy_conformance.wire_server import WireServer, reject_expect_capturing

from .conftest import Findings
from .proxies import ProxyUrls, tagged_url


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
            path=tagged_url("/continue", "basic-100-continue"),
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
            path=tagged_url("/continue/skip-100", "upstream-ignores-expect"),
            body=b"the request body",
        )

        assert result.final.status == 200
        assert result.final.body == b"OK\n", (
            f"Expected upstream response body b'OK\\n', got {result.final.body!r}"
        )

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
    Uses WireServer to verify the proxy does not forward body bytes after
    the 417 rejection, and handles both 417-response and connection-close
    as valid client-side outcomes.
    """

    def test_417_forwarded(
        self,
        proxy: ProxyUrls,
        wire_server: WireServer,
        findings: Findings,
        proxy_name: str,
    ) -> None:
        request_arrived = threading.Event()
        body_after_417: list[bytes] = []
        wire_server.add_route(
            "/continue/reject-capture",
            reject_expect_capturing(request_arrived, body_after_417),
        )

        host = proxy.wire_host
        port = proxy.wire_port
        path = tagged_url("/continue/reject-capture", "upstream-rejects-expect")

        # Use raw sockets to handle BrokenPipeError gracefully.
        # The proxy may close the connection after relaying 417,
        # which is conformant per RFC 9110 §10.1.1.
        sock = socket.create_connection((host, port), timeout=5.0)
        client_status: int | None = None
        try:
            raw_request = (
                f"POST {path} HTTP/1.1\r\n"
                f"Host: {host}:{port}\r\n"
                f"Expect: 100-continue\r\n"
                f"Content-Length: 16\r\n"
                f"Content-Type: application/octet-stream\r\n"
                f"\r\n"
            )
            sock.sendall(raw_request.encode())
            sock.settimeout(4.0)
            response_bytes = b""
            try:
                while True:
                    data = sock.recv(4096)
                    if not data:
                        break
                    response_bytes += data
            except OSError:
                pass
        finally:
            sock.close()

        # Skip 1xx informational responses (e.g., 100 Continue) to
        # find the final response status.
        remaining = response_bytes
        while remaining:
            try:
                parsed = _parse_raw_response(remaining)
            except ValueError:
                break
            if parsed.status < 200:
                # Advance past this informational response.
                header_end = remaining.find(b"\r\n\r\n")
                remaining = remaining[header_end + 4 :]
                continue
            client_status = parsed.status
            break

        forwarded = request_arrived.wait(timeout=0.5)

        # Wire-level assertion: proxy forwarded request to backend
        assert forwarded, "Proxy did not forward request to backend"

        # Wire-level assertion: backend did not receive body bytes
        # after sending 417
        if body_after_417:
            assert body_after_417[0] == b"", (
                "Proxy forwarded body bytes to backend after 417 "
                f"rejection: {body_after_417[0]!r}"
            )

        # Client-side: 417 or connection close are both conformant.
        # The proxy closing the connection after relaying 417 is
        # valid per RFC 9110 §10.1.1.
        assert client_status is None or client_status == 417, (
            f"Expected 417 or connection close, got {client_status}"
        )

        if client_status == 417:
            findings.record(
                "upstream-rejects-expect",
                f"[{proxy_name}] Proxy forwarded 417 to client",
                level="info",
            )
        else:
            findings.record(
                "upstream-rejects-expect",
                f"[{proxy_name}] Proxy closed connection after upstream 417 rejection",
                level="finding",
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
            path=tagged_url("/continue", "client-sends-body-early"),
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
