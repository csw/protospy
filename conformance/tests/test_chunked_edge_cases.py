"""Chunked transfer encoding edge-case conformance tests (category 7).

§7.1: Request trailers are forwarded to the target.
§7.2: Response trailers are forwarded to the client.
§7.3: Missing final chunk in request triggers proxy error.
§7.4: Missing final chunk in response — streaming proxy drops connection.
§7.5: Invalid chunk size in request — proxy returns error.
§7.6: Invalid chunk size in response — proxy returns error.
§7.7: Trailer announcement header (Trailer:) is forwarded.

Absorbs all tests from test_chunked_errors.py and the chunked-related
tests from test_wire_server.py (TestMalformedChunks).
"""

from __future__ import annotations

import queue
import socket
import urllib.parse

import h11
import httpx
import pytest

from proxy_conformance.good_server import GoodServer
from proxy_conformance.h11_client import (
    RawResponse,
    _read_complete_response,
    parse_chunked_trailers,
    send_and_read_response,
    send_incomplete_chunked_request,
    send_invalid_chunk_size,
    send_invalid_chunk_size_delay,
)
from proxy_conformance.types import (
    ClientExpectation,
    ConnectionDrop,
    HeaderExpectation,
    ProxyQuirk,
    TargetExpectation,
    apply_quirk,
    assert_probe_result,
    assert_probe_target,
    send_expecting_error,
)
from proxy_conformance.wire_server import WireServer, incomplete_request_target

from .conftest import Findings
from .proxies import ProxyUrls, tagged_url

# §7.1: Both Caddy and HAProxy strip request trailers.
_REQUEST_TRAILERS_QUIRKS: dict[str, ProxyQuirk] = {
    "caddy": ProxyQuirk(
        disposition="override",
        reason="Caddy strips request trailers",
        target=TargetExpectation(
            headers=HeaderExpectation(
                absent=["x-custom-trailer"],
            ),
        ),
    ),
    "haproxy": ProxyQuirk(
        disposition="override",
        reason="HAProxy strips request trailers",
        target=TargetExpectation(
            headers=HeaderExpectation(
                absent=["x-custom-trailer"],
            ),
        ),
    ),
}

# §7.5: Caddy returns 502 instead of 400 for invalid chunk size.
# HAProxy behavior is variant-dependent: immediate invalid chunk → always
# 400; delayed invalid chunk (valid chunk first, then invalid) → always
# connection drop. Both variants share a single quirk accepting either
# outcome because the test IDs are shared.
_INVALID_CHUNK_SIZE_REQUEST_QUIRKS: dict[str, ProxyQuirk] = {
    "caddy": ProxyQuirk(
        disposition="override",
        reason="Returns 502 instead of 400 for invalid chunk size",
        client=ClientExpectation(status=502),
        target=TargetExpectation(no_request=True),
    ),
    "haproxy": ProxyQuirk(
        disposition="override",
        reason=(
            "Variant-dependent: immediate invalid chunk → 400, "
            "delayed invalid chunk → connection drop"
        ),
        client=[ClientExpectation(status=400), ConnectionDrop()],
        target=TargetExpectation(no_request=True),
    ),
}


def _describe_status(status: int | None) -> str:
    """Format a status code for findings output."""
    return f"status {status}" if status is not None else "connection drop"


def _probe_finding(
    findings: Findings,
    test_id: str,
    proxy_name: str,
    message: str,
    *,
    quirk: ProxyQuirk | None = None,
) -> None:
    """Record a probe finding, using quirk.reason as context when present.

    Quirk active → "finding" level, reason appended in parentheses.
    No quirk → "info" level, message only.
    """
    if quirk:
        findings.record(
            test_id,
            f"[{proxy_name}] {message} ({quirk.reason})",
            level="finding",
        )
    else:
        findings.record(
            test_id,
            f"[{proxy_name}] {message}",
            level="info",
        )


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


def _assert_raw_response(
    result: RawResponse | None,
    expected: ClientExpectation
    | ConnectionDrop
    | list[ClientExpectation | ConnectionDrop],
    test_id: str = "",
) -> None:
    """Assert a RawResponse matches expected outcomes.

    Like assert_probe_result but for h11 client results (RawResponse | None)
    rather than ProbeResult.
    """
    from proxy_conformance.types import ProbeResult

    probe = ProbeResult(
        status=result.status if result else None,
        body=result.body if result else b"",
        headers=result.headers if result else {},
    )
    assert_probe_result(probe, expected, test_id=test_id)


@pytest.mark.xfail_for("protospy")
def test_request_trailers_forwarded(
    proxy: ProxyUrls,
    good_server: GoodServer,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy forwards request trailers to the target (§7.1).

    RFC 9110 §6.5.1 allows request trailers. Default expectation: trailers
    are forwarded. Both Caddy and HAProxy strip them (override quirk).
    """
    quirk = apply_quirk(proxy_name, _REQUEST_TRAILERS_QUIRKS)

    host = proxy.good_host
    port = proxy.good_port
    path = tagged_url("/echo", "request-trailers")

    _send_chunked_with_trailers(
        host,
        port,
        path,
        b"hello",
        [("x-custom-trailer", "trailer-value")],
    )

    # Default target expectation: trailer is forwarded.
    default_target = TargetExpectation(
        headers=HeaderExpectation(
            present={"x-custom-trailer": "trailer-value"},
        ),
    )
    effective_target = quirk.target if quirk and quirk.target else default_target
    assert_probe_target(
        good_server,
        effective_target,
        test_id="request-trailers",
        timeout=1.0,
    )

    _probe_finding(
        findings,
        "request-trailers",
        proxy_name,
        "Proxy handled request trailers",
        quirk=quirk,
    )


def test_response_trailers_forwarded(
    proxy: ProxyUrls,
    good_server: GoodServer,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy forwards response trailers to the client (§7.2).

    httpx does not expose HTTP/1.1 trailers, so we use the h11
    raw client to read the chunked body and parse trailers from
    the wire bytes.
    """
    path = tagged_url(
        ("/chunked-with-trailers?X-Custom-Trailer=trailer-value"),
        "response-trailers",
    )
    result = send_and_read_response(
        host=proxy.good_host,
        port=proxy.good_port,
        path=path,
    )
    assert result is not None, "Connection closed with no response"
    assert result.status == 200

    trailers = parse_chunked_trailers(result.body)
    if "x-custom-trailer" in trailers:
        findings.record(
            "response-trailers",
            (f"[{proxy_name}] Proxy forwarded response trailer X-Custom-Trailer"),
            level="info",
        )
    else:
        findings.record(
            "response-trailers",
            (f"[{proxy_name}] Proxy stripped response trailer X-Custom-Trailer"),
            level="finding",
        )
    good_server.clear()


def test_wire_forwarding_of_incomplete_chunked_request(
    proxy: ProxyUrls,
    wire_server: WireServer,
    findings: Findings,
    proxy_name: str,
) -> None:
    """WireServer verifies faithful forwarding of incomplete chunked request (§7.3).

    When a proxy forwards an incomplete chunked POST to the backend:
    - Scenario A: the forwarded bytes must not include the terminal ``0\\r\\n\\r\\n``
      (the proxy must not silently repair the encoding).
    - Scenario B: the request is incomplete — its terminating zero-length chunk
      never arrives (RFC 9112 §8). Per RFC 9112 §8 a server that receives an
      incomplete request MAY send an error response before closing, so the proxy
      may relay the backend's early 200, return a 5xx, or drop the connection;
      all three are conformant. The actual outcome is recorded as a finding.
      (Caddy races client-context cancellation against upstream EOF, yielding
      200 or 502 non-deterministically — see
      docs/process/findings-caddy-pool-state-behavior.md.)

    Proxies that reject the incomplete encoding before forwarding are recorded
    as a finding. Forwarding proxies are held to the Scenario A assertion and
    the relaxed Scenario B outcome set.
    """
    received: list[bytes] = []
    wire_server.add_route(
        "/chunked-wire-test",
        incomplete_request_target(received),
    )

    result = send_incomplete_chunked_request(
        host=proxy.wire_host,
        port=proxy.wire_port,
        path=tagged_url("/chunked-wire-test", "incomplete-chunked-wire"),
        chunk_data=b"this body is deliberately incomplete",
    )

    if received and received[0]:
        # Proxy forwarded to WireServer and body bytes were captured.
        raw = received[0]
        # Scenario A: proxy did not repair the encoding by appending 0\r\n\r\n
        assert b"this body is deliberately incomplete" in raw, (
            f"Forwarded bytes missing expected chunk data: {raw!r}"
        )
        assert not raw.endswith(b"0\r\n\r\n"), (
            "Proxy appended terminal chunk — silently repaired the incomplete encoding"
        )
        # Scenario B: the request was incomplete (no terminal chunk), so per
        # RFC 9112 §8 the proxy MAY relay the backend's early 200 or signal an
        # error. Relay (200), gateway error (5xx), and connection drop are all
        # conformant; record which one occurred.
        _assert_raw_response(
            result,
            [
                ClientExpectation(status=200),
                ClientExpectation(status_in={502, 504}),
                ConnectionDrop(),
            ],
            test_id="incomplete-chunked-wire",
        )
        outcome = _describe_status(result.status if result else None)
        findings.record(
            "incomplete-chunked-wire",
            f"[{proxy_name}] Proxy forwarded {len(raw)} raw bytes; "
            f"client got {outcome}",
            level="info",
        )
    else:
        actual = _describe_status(result.status if result else None)
        findings.record(
            "incomplete-chunked-wire",
            f"[{proxy_name}] Proxy did not forward to WireServer; responded {actual}",
            level="finding",
        )


def test_missing_final_chunk_response(
    proxy: ProxyUrls,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy handles response missing terminal chunk (§7.4).

    WireServer /missing-final-chunk sends valid chunk data but closes
    without the terminal 0-length chunk. A streaming proxy that has
    already started forwarding can only signal the failure by dropping
    the connection. A buffering proxy that detects the close before
    forwarding may return 502 instead. Both outcomes are accepted.
    """
    url = tagged_url(
        f"{proxy.wire_url}/missing-final-chunk",
        "missing-final-chunk-response",
    )
    result = send_expecting_error(client, url)

    assert_probe_result(
        result,
        [ConnectionDrop(), ClientExpectation(status=502)],
        test_id="missing-final-chunk-response",
    )

    outcome = (
        "dropped connection" if result.status is None else f"returned {result.status}"
    )
    _probe_finding(
        findings,
        "missing-final-chunk-response",
        proxy_name,
        f"Proxy {outcome} for missing final chunk",
    )


def test_invalid_chunk_size_request_immediate(
    proxy: ProxyUrls,
    good_server: GoodServer,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy returns error for request with invalid hex chunk size (§7.5).

    RFC 9112 §7.1 requires chunk-size to be hex digits. Default: 400.
    Caddy returns 502 (override quirk).
    """
    quirk = apply_quirk(proxy_name, _INVALID_CHUNK_SIZE_REQUEST_QUIRKS)

    result = send_invalid_chunk_size(
        host=proxy.good_host,
        port=proxy.good_port,
        path=tagged_url("/echo", "invalid-chunk-size-request"),
    )

    # Client-side assertion
    effective_client = (
        quirk.client if quirk and quirk.client else ClientExpectation(status=400)
    )
    _assert_raw_response(result, effective_client, test_id="invalid-chunk-size-request")

    # Target-side assertion: default is no request forwarded
    effective_target = (
        quirk.target if quirk and quirk.target else TargetExpectation(no_request=True)
    )
    assert_probe_target(
        good_server,
        effective_target,
        test_id="invalid-chunk-size-request",
    )

    actual = _describe_status(result.status if result else None)
    _probe_finding(
        findings,
        "invalid-chunk-size-request",
        proxy_name,
        f"Proxy returned {actual} for invalid chunk size",
        quirk=quirk,
    )


def test_invalid_chunk_size_request_delayed(
    proxy: ProxyUrls,
    good_server: GoodServer,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy returns error for request with invalid hex chunk size (§7.5), sent
    after a delay.

    RFC 9112 §7.1 requires chunk-size to be hex digits. Default: 400.
    Caddy returns 502 (override quirk).
    """
    quirk = apply_quirk(proxy_name, _INVALID_CHUNK_SIZE_REQUEST_QUIRKS)

    # N.B. this is 100 ms, comfortably in excess of proxy::body::PEEK_DURATION
    # which is currently 100 usec. If that, or the poll behavior, changes, this
    # may need to be adjusted.
    chunk_delay = 0.1

    result = send_invalid_chunk_size_delay(
        chunk_delay=chunk_delay,
        host=proxy.good_host,
        port=proxy.good_port,
        path=tagged_url("/echo", "invalid-chunk-size-request"),
    )

    # Client-side assertion
    effective_client = (
        quirk.client if quirk and quirk.client else ClientExpectation(status=400)
    )
    _assert_raw_response(result, effective_client, test_id="invalid-chunk-size-request")

    # Target-side assertion: default is no request forwarded
    effective_target = (
        quirk.target if quirk and quirk.target else TargetExpectation(no_request=True)
    )
    assert_probe_target(
        good_server,
        effective_target,
        test_id="invalid-chunk-size-request",
    )

    actual = _describe_status(result.status if result else None)
    _probe_finding(
        findings,
        "invalid-chunk-size-request",
        proxy_name,
        f"Proxy returned {actual} for invalid chunk size",
        quirk=quirk,
    )


def test_invalid_chunk_size_response(
    proxy: ProxyUrls,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy signals error for upstream invalid chunked framing (§7.6).

    A streaming proxy may have started forwarding before detecting the
    invalid framing. Both connection drop and 5xx are acceptable.
    """
    url = tagged_url(f"{proxy.wire_url}/malformed-chunks", "malformed-chunks")
    result = send_expecting_error(client, url)

    assert_probe_result(
        result,
        [ClientExpectation(status_in={502}), ConnectionDrop()],
        test_id="malformed-chunks",
    )

    _probe_finding(
        findings,
        "malformed-chunks",
        proxy_name,
        f"Proxy responded with {_describe_status(result.status)} "
        "for malformed chunked framing",
    )


def test_trailer_announce_header(
    proxy: ProxyUrls,
    good_server: GoodServer,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy forwards the Trailer announcement header (§7.7).

    The Trailer header announces which headers will follow the body.
    Both Caddy and HAProxy forward this header.
    """
    host = proxy.good_host
    port = proxy.good_port
    path = tagged_url("/echo", "trailer-announce-header")

    _send_chunked_with_trailers(
        host,
        port,
        path,
        b"data",
        [("x-my-trailer", "my-value")],
        announce=True,
    )

    captured = good_server.last_request(timeout=1.0)
    trailer_header = captured.header_values("trailer")

    assert trailer_header, "Expected Trailer announcement header to be forwarded"

    findings.record(
        "trailer-announce-header",
        f"[{proxy_name}] Proxy forwarded Trailer announcement: {trailer_header}",
        level="info",
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
