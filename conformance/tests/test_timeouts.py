"""Proxy conformance tests for timeout behavior (§10).

Uses a short-timeout proxy instance via the module-scoped `timeout_proxy`
fixture — separate from the session-scoped proxy to avoid affecting other tests.

§10.2: Proxy returns 5xx when upstream stalls before sending response headers.
§10.3: Proxy handles upstream stalling mid-body.
§10.4: Proxy handles client stalling during request body (findings-based).
§10.5: Proxy closes idle connection after response (findings-based).

§10.1 (connection-refused vs timeout distinction) is deferred — the behavior
overlaps with upstream-unreachable (§9.1) and is not meaningfully distinguishable
in this test setup.
"""

from __future__ import annotations

import socket
from collections.abc import Generator

import httpx
import pytest

from proxy_conformance.net import find_free_port
from proxy_conformance.types import send_expecting_error
from proxy_conformance.wire_server import WireServer

from .conftest import Findings, ProxyUrls, _make_proxy_urls, _test_url
from .proxies import ProxyEntry, start_caddy, start_haproxy


@pytest.fixture(scope="module")
def timeout_proxy(
    proxy_type: str,
    wire_server: WireServer,
    tmp_path_factory: pytest.TempPathFactory,
) -> Generator[ProxyUrls]:
    """Proxy configured with short upstream timeouts. Wire-only (no GoodServer)."""
    good = ProxyEntry(listen_port=find_free_port(), upstream=wire_server.url)
    wire = ProxyEntry(listen_port=find_free_port(), upstream=wire_server.url)
    dead = ProxyEntry(
        listen_port=find_free_port(),
        upstream=f"http://127.0.0.1:{find_free_port()}",
    )
    tmp = tmp_path_factory.mktemp("timeout-proxy")
    if proxy_type == "caddy":
        proc = start_caddy(
            good,
            wire,
            dead,
            tmp_dir=tmp,
            dial_timeout="1s",
            response_header_timeout="2s",
            idle_timeout="1s",
            read_timeout="2s",
        )
    else:
        proc = start_haproxy(
            good,
            wire,
            dead,
            tmp_dir=tmp,
            connect_timeout="1s",
            server_timeout="2s",
            client_timeout="2s",
        )
    try:
        yield _make_proxy_urls(good, wire, dead)
    finally:
        proc.terminate()
        proc.wait(timeout=5)


@pytest.fixture(scope="module")
def timeout_client() -> Generator[httpx.Client]:
    """httpx client with a generous read timeout for timeout proxy tests."""
    with httpx.Client(trust_env=False, timeout=10.0) as c:
        yield c


def test_upstream_response_timeout(
    timeout_proxy: ProxyUrls,
    timeout_client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy returns 5xx when upstream stalls before sending response headers (§10.2).

    WireServer /stall/before-response sleeps for 3s. The timeout proxy is
    configured with a 2s upstream timeout (response_header_timeout for Caddy,
    server_timeout for HAProxy). The proxy should return 504 or 502.
    """
    url = _test_url(
        f"{timeout_proxy.wire_url}/stall/before-response",
        "upstream-response-timeout",
    )
    result = send_expecting_error(timeout_client, url)

    if result.status is None:
        findings.record(
            "upstream-response-timeout",
            f"[{proxy_name}] Proxy closed connection without response (expected 504)",
            level="finding",
        )
    else:
        findings.record(
            "upstream-response-timeout",
            f"[{proxy_name}] Proxy returned {result.status} for upstream stall "
            "(expected 504 per RFC 7235)",
            level="finding",
        )
        assert result.status in {502, 504}, f"Expected 502 or 504, got {result.status}"


def test_upstream_body_stall(
    timeout_proxy: ProxyUrls,
    timeout_client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy handles upstream stalling mid-body (§10.3). Findings-based.

    WireServer /stall/mid-body sends headers + 100 bytes then stalls 3s.
    Proxy should either return 502 or close the connection after its timeout.
    """
    url = _test_url(
        f"{timeout_proxy.wire_url}/stall/mid-body",
        "upstream-body-stall",
    )
    result = send_expecting_error(timeout_client, url)

    if result.status is None:
        findings.record(
            "upstream-body-stall",
            f"[{proxy_name}] Proxy closed connection without response "
            "during body stall",
            level="finding",
        )
    else:
        findings.record(
            "upstream-body-stall",
            f"[{proxy_name}] Proxy returned {result.status} for upstream body stall",
            level="finding",
        )


def test_client_body_stall(
    timeout_proxy: ProxyUrls,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy handles client stalling after sending request headers (§10.4).

    Sends request headers with Content-Length but no body. The proxy should
    eventually close the connection or respond with 408 Request Timeout.
    Findings-based.
    """
    host = timeout_proxy.wire_host
    port = timeout_proxy.wire_port

    sock = socket.create_connection((host, port), timeout=5.0)
    try:
        # Send request headers with Content-Length but deliberately no body.
        request_headers = (
            f"POST {_test_url('/echo', 'client-body-stall')} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            f"Content-Length: 100\r\n"
            f"Content-Type: application/octet-stream\r\n"
            f"\r\n"
        )
        sock.sendall(request_headers.encode())
        # Stall: do not send the body. Wait for the proxy to act.
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

    if not response_bytes:
        findings.record(
            "client-body-stall",
            f"[{proxy_name}] Proxy closed connection without response "
            "during client body stall",
            level="finding",
        )
    else:
        first_line = response_bytes.split(b"\r\n", 1)[0].decode(errors="replace")
        findings.record(
            "client-body-stall",
            f"[{proxy_name}] Proxy responded to client body stall: {first_line}",
            level="finding",
        )


def test_idle_connection_timeout(
    timeout_proxy: ProxyUrls,
    timeout_client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy closes idle connection after response (§10.5). Findings-based.

    Sends a valid request, receives the response, then holds the connection
    open for a while. The proxy should eventually close it.
    """
    host = timeout_proxy.wire_host
    port = timeout_proxy.wire_port

    sock = socket.create_connection((host, port), timeout=5.0)
    try:
        path = _test_url("/", "idle-connection-timeout")
        request = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            f"Connection: keep-alive\r\n"
            f"\r\n"
        )
        sock.sendall(request.encode())

        # Read the response
        sock.settimeout(5.0)
        response_bytes = b""
        while b"\r\n\r\n" not in response_bytes:
            try:
                data = sock.recv(4096)
                if not data:
                    break
                response_bytes += data
            except OSError:
                break

        # Now idle — wait to see if the proxy closes the connection
        sock.settimeout(4.0)
        try:
            extra = sock.recv(4096)
            if not extra:
                findings.record(
                    "idle-connection-timeout",
                    f"[{proxy_name}] Proxy closed idle connection after response",
                    level="finding",
                )
            else:
                findings.record(
                    "idle-connection-timeout",
                    f"[{proxy_name}] Proxy sent unexpected data on idle connection: "
                    f"{extra[:50]!r}",
                    level="finding",
                )
        except OSError:
            findings.record(
                "idle-connection-timeout",
                f"[{proxy_name}] Proxy reset idle connection",
                level="finding",
            )
    finally:
        sock.close()
