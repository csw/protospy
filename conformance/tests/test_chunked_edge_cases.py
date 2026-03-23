"""Chunked transfer encoding edge-case conformance tests (category 7).

§7.1: Request trailers are forwarded to the target.
§7.2: Response trailers are forwarded to the client.
§7.3: Missing final chunk in request triggers proxy error (findings-based).
§7.4: Missing final chunk in response triggers proxy error (findings-based).
§7.5: Invalid chunk size in request — proxy returns error (findings-based).
§7.6: Invalid chunk size in response — proxy returns error.
§7.7: Trailer announcement header (Trailer:) is forwarded (findings-based).

Absorbs all tests from test_chunked_errors.py and the chunked-related
tests from test_wire_server.py (TestMalformedChunks).
"""

from __future__ import annotations

import queue
import socket
import urllib.parse

import h11
import httpx

from proxy_conformance.good_server import GoodServer
from proxy_conformance.h11_client import (
    _read_complete_response,
    send_incomplete_chunked_request,
    send_invalid_chunk_size,
)
from proxy_conformance.types import (
    ClientExpectation,
    ProxyQuirk,
    apply_quirk,
    send_expecting_error,
)

from .conftest import Findings
from .proxies import ProxyUrls, tagged_url

# Per-proxy behavioral quirks for the missing-final-chunk-request test (§7.3).
#
# The correct behavior per RFC 9112 §7.1 is 400 Bad Request. Neither Caddy
# nor HAProxy returns 400:
#
# - Caddy: returns 200 or 502 non-deterministically due to a race condition
#   between context cancellation (client SHUT_WR) and upstream EOF. Marked
#   xfail. See docs/process/findings-caddy-pool-state-behavior.md
#
# - HAProxy: usually drops the connection without sending any response (strict
#   chunked parser). Under load, occasionally forwards the incomplete request
#   to the backend instead (race between chunked body validation and TCP FIN
#   receipt — same class of non-determinism as the Caddy race above). Both
#   outcomes are recorded as findings rather than asserted, to avoid flakiness.
_INCOMPLETE_CHUNK_QUIRKS: dict[str, ProxyQuirk] = {
    "caddy": ProxyQuirk(
        disposition="xfail",
        reason=(
            "Race condition: returns 200 or 502, not 400 "
            "(reverseproxy.go:653 context.Canceled short-circuit). "
            "See docs/process/findings-caddy-pool-state-behavior.md"
        ),
    ),
    "haproxy": ProxyQuirk(
        disposition="override",
        reason=(
            "Non-deterministic: usually drops connection (strict chunked parser), "
            "but occasionally forwards to backend under load (race between chunked "
            "body validation and TCP FIN receipt)"
        ),
        client=ClientExpectation(status=None),
    ),
}


def _send_chunked_with_trailers(
    host: str,
    port: int,
    path: str,
    body: bytes,
    trailers: list[tuple[str, str]],
    announce: bool = True,
) -> bytes:
    """Send a chunked POST with trailers via h11. Returns raw response bytes."""
    conn = h11.Connection(our_role=h11.CLIENT)
    request_headers: list[tuple[str, str]] = [
        ("host", f"{host}:{port}"),
        ("transfer-encoding", "chunked"),
    ]
    if announce:
        request_headers.append(("trailer", ", ".join(name for name, _ in trailers)))

    with socket.create_connection((host, port), timeout=5.0) as sock:
        sock.sendall(
            conn.send(h11.Request(method="POST", target=path, headers=request_headers))
        )
        sock.sendall(conn.send(h11.Data(data=body)))
        sock.sendall(
            conn.send(
                h11.EndOfMessage(
                    headers=[(name, value) for name, value in trailers],
                )
            )
        )
        response_bytes = _read_complete_response(sock)
    return response_bytes


def test_request_trailers_forwarded(
    proxy: ProxyUrls,
    good_server: GoodServer,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy forwards request trailers to the target (§7.1). Findings-based.

    RFC 9110 §6.5.1 allows request trailers; many proxies strip them.
    """
    host = proxy.good_host
    port = proxy.good_port
    path = tagged_url("/echo", "request-trailers")

    _send_chunked_with_trailers(
        host, port, path, b"hello", [("x-custom-trailer", "trailer-value")]
    )

    try:
        captured = good_server.last_request(timeout=1.0)
        trailer_values = captured.header_values("x-custom-trailer")
        if trailer_values:
            findings.record(
                "request-trailers",
                f"[{proxy_name}] Proxy forwarded request trailer x-custom-trailer",
                level="finding",
            )
        else:
            findings.record(
                "request-trailers",
                f"[{proxy_name}] Proxy stripped request trailer x-custom-trailer",
                level="finding",
            )
    except queue.Empty:
        findings.record(
            "request-trailers",
            f"[{proxy_name}] Target received no request "
            "(proxy may have rejected trailer)",
            level="finding",
        )


def test_response_trailers_forwarded(
    proxy: ProxyUrls,
    good_server: GoodServer,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy forwards response trailers to the client (§7.2). Findings-based.

    httpx does not expose HTTP/1.1 trailers, so we only verify the response
    arrived without error.
    """
    url = tagged_url(
        f"{proxy.good_url}/chunked-with-trailers?X-Custom-Trailer=trailer-value",
        "response-trailers",
    )
    try:
        response = client.get(url)
        findings.record(
            "response-trailers",
            f"[{proxy_name}] Response with trailers received, "
            f"status={response.status_code}",
            level="finding",
        )
        assert response.status_code == 200
    except Exception as exc:
        findings.record(
            "response-trailers",
            f"[{proxy_name}] Error receiving response with trailers: {exc}",
            level="finding",
        )
    good_server.clear()


def test_missing_final_chunk_request(
    proxy: ProxyUrls,
    good_server: GoodServer,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy handles a chunked request missing the terminal zero-length chunk (§7.3).

    RFC 9112 §7.1 expects 400. Neither Caddy nor HAProxy returns 400 —
    see _INCOMPLETE_CHUNK_QUIRKS for documented deviations.
    Absorbed from test_chunked_errors.py.
    """
    result = send_incomplete_chunked_request(
        host=proxy.good_host,
        port=proxy.good_port,
        path=tagged_url("/chunked-error-test", "incomplete-chunked-request"),
        chunk_data=b"this body is deliberately incomplete",
    )

    quirk = apply_quirk(proxy_name, _INCOMPLETE_CHUNK_QUIRKS)
    expects_connection_drop = (
        quirk is not None and quirk.client is not None and quirk.client.status is None
    )

    if expects_connection_drop:
        if result is None:
            findings.record(
                "incomplete-chunked-request",
                f"[{proxy_name}] Proxy dropped connection without response "
                "for incomplete chunked request (RFC 9112 §7.1 expects 400)",
                level="finding",
            )
        else:
            # Race condition: proxy forwarded the incomplete chunked request to
            # the backend before its chunked parser could reject it.  Recorded
            # as a finding rather than a failure — the outcome is
            # non-deterministic under load (same class as the Caddy race).
            findings.record(
                "incomplete-chunked-request",
                f"[{proxy_name}] Proxy forwarded incomplete chunked request "
                f"to backend (status {result.status}); race between chunked "
                "body validation and TCP FIN receipt "
                "(RFC 9112 §7.1 expects 400)",
                level="finding",
            )
        return

    assert result is not None, "Proxy closed connection with no response"
    findings.record(
        "incomplete-chunked-request",
        f"Proxy returned {result.status} for incomplete "
        "chunked request (expected 400 per RFC 9112 §7.1)",
        level="finding",
    )

    try:
        captured = good_server.last_request(timeout=0.5)
        findings.record(
            "incomplete-chunked-request",
            f"Target received {captured.method} {captured.path} "
            f"with {len(captured.body)} bytes (proxy forwarded incomplete body)",
            level="finding",
        )
    except queue.Empty:
        findings.record(
            "incomplete-chunked-request",
            "Target received no request (proxy rejected before forwarding)",
            level="info",
        )


def test_missing_final_chunk_response(
    proxy: ProxyUrls,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy handles response missing the terminal zero-length chunk (§7.4).

    WireServer /missing-final-chunk sends valid chunk data but closes the
    connection without sending the terminal 0-length chunk. Findings-based.
    """
    url = tagged_url(
        f"{proxy.wire_url}/missing-final-chunk", "missing-final-chunk-response"
    )
    result = send_expecting_error(client, url)

    if result.status is None:
        findings.record(
            "missing-final-chunk-response",
            f"[{proxy_name}] Proxy closed connection without response "
            "for missing final chunk",
            level="finding",
        )
    else:
        findings.record(
            "missing-final-chunk-response",
            f"[{proxy_name}] Proxy returned {result.status} for missing final chunk",
            level="finding",
        )


def test_invalid_chunk_size_request(
    proxy: ProxyUrls,
    good_server: GoodServer,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy returns error for request with invalid hex chunk size (§7.5).

    RFC 9112 §7.1 requires chunk-size to be hex digits. A conforming proxy
    should return 400, but behavior varies. Findings-based.
    """
    result = send_invalid_chunk_size(
        host=proxy.good_host,
        port=proxy.good_port,
        path=tagged_url("/echo", "invalid-chunk-size-request"),
    )

    if result is None:
        findings.record(
            "invalid-chunk-size-request",
            f"[{proxy_name}] Proxy closed connection without response "
            "for invalid chunk size",
            level="finding",
        )
    else:
        findings.record(
            "invalid-chunk-size-request",
            f"[{proxy_name}] Proxy returned {result.status} for invalid chunk size "
            "(RFC 9112 §7.1 expects 400)",
            level="finding",
        )
    good_server.clear()


def test_invalid_chunk_size_response(
    proxy: ProxyUrls,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy signals an error when upstream sends invalid chunked framing (§7.6).

    Absorbed from test_wire_server.py (TestMalformedChunks).
    """
    url = tagged_url(f"{proxy.wire_url}/malformed-chunks", "malformed-chunks")
    result = send_expecting_error(client, url)

    if result.status is None:
        findings.record(
            "malformed-chunks",
            f"[{proxy_name}] Proxy closed connection without a response "
            "for malformed chunked framing (expected 502 per RFC 9112 §7.1)",
            level="finding",
        )
    else:
        findings.record(
            "malformed-chunks",
            f"[{proxy_name}] Proxy returned {result.status} for malformed chunks",
            level="finding",
        )
        assert result.status >= 500


def test_trailer_announce_header(
    proxy: ProxyUrls,
    good_server: GoodServer,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy forwards the Trailer announcement header (§7.7). Findings-based.

    The Trailer header announces which headers will follow the body. Proxies
    may or may not preserve this announcement.
    """
    host = proxy.good_host
    port = proxy.good_port
    path = tagged_url("/echo", "trailer-announce-header")

    _send_chunked_with_trailers(
        host, port, path, b"data", [("x-my-trailer", "my-value")], announce=True
    )

    try:
        captured = good_server.last_request(timeout=1.0)
        trailer_header = captured.header_values("trailer")
        if trailer_header:
            findings.record(
                "trailer-announce-header",
                f"[{proxy_name}] Proxy forwarded Trailer announcement: "
                f"{trailer_header}",
                level="finding",
            )
        else:
            findings.record(
                "trailer-announce-header",
                f"[{proxy_name}] Proxy stripped Trailer announcement header",
                level="finding",
            )
    except queue.Empty:
        findings.record(
            "trailer-announce-header",
            f"[{proxy_name}] Target received no request",
            level="finding",
        )


class TestH11ClientIntegration:
    """Verify the h11 client helper works at all.

    Sends an incomplete request directly to the echo server to confirm
    socket-level mechanics — separate from proxy behavior.
    Absorbed from test_chunked_errors.py.
    """

    def test_direct_to_good_server(
        self, good_server: GoodServer, findings: Findings
    ) -> None:
        """Echo server receives partial data when client drops early."""
        parsed = urllib.parse.urlparse(good_server.url)
        assert parsed.hostname is not None
        assert parsed.port is not None

        result = send_incomplete_chunked_request(
            host=parsed.hostname,
            port=parsed.port,
            path="/direct-test",
            chunk_data=b"hello",
        )

        if result is not None:
            findings.record(
                "h11-direct",
                f"Echo server responded with status {result.status}",
                level="info",
            )
        else:
            findings.record(
                "h11-direct",
                "Echo server closed connection with no response",
                level="info",
            )

        try:
            good_server.last_request(timeout=0.5)
        except queue.Empty:
            pass
