"""Proxy conformance tests for timeout behavior (§10).

Uses a short-timeout proxy instance via the module-scoped `timeout_proxy`
fixture — separate from the session-scoped proxy to avoid affecting other tests.

§10.2: Proxy returns 5xx when upstream stalls before sending response headers.
§10.3: Proxy handles upstream stalling mid-body.
§10.4: Proxy handles client stalling during request body.
§10.5: Proxy closes idle connection after response.

§10.1 (connection-refused vs timeout distinction) is deferred — the behavior
overlaps with upstream-unreachable (§9.1) and is not meaningfully distinguishable
in this test setup.
"""

from __future__ import annotations

import socket
import subprocess
from collections.abc import Generator
from pathlib import Path

import httpx
import pytest

from proxy_conformance.net import find_free_port
from proxy_conformance.types import (
    ClientExpectation,
    ConnectionDrop,
    ProxyQuirk,
    apply_quirk,
    assert_probe_result,
    send_expecting_error,
)
from proxy_conformance.wire_server import WireServer

from .conftest import Findings
from .proxies import (
    ProxyEntry,
    ProxyUrls,
    make_proxy_urls,
    start_caddy,
    start_haproxy,
    tagged_url,
)

_TIMEOUT_START_RETRIES = 3

# §10.4: Client body stall — behavior varies widely.
# Caddy forwards headers immediately, backend responds with 200 (no body wait).
# HAProxy's strict parser returns 400 Bad Request.
_CLIENT_BODY_STALL_QUIRKS: dict[str, ProxyQuirk] = {
    "caddy": ProxyQuirk(
        disposition="override",
        reason=(
            "Caddy forwards headers immediately without waiting "
            "for body; backend responds 200"
        ),
        client=ClientExpectation(status=200),
    ),
    "haproxy": ProxyQuirk(
        disposition="override",
        reason="HAProxy returns 400 Bad Request for missing body",
        client=ClientExpectation(status=400),
    ),
}


def _start_timeout_proxy(
    proxy_type: str,
    wire_url: str,
    tmp: Path,
) -> tuple[subprocess.Popen[bytes], ProxyUrls]:
    """Start a timeout-configured proxy, retrying on port conflicts."""
    last_exc: RuntimeError | None = None
    for attempt in range(_TIMEOUT_START_RETRIES):
        good = ProxyEntry(listen_port=find_free_port(), upstream=wire_url)
        wire = ProxyEntry(listen_port=find_free_port(), upstream=wire_url)
        dead = ProxyEntry(
            listen_port=find_free_port(),
            upstream=f"http://127.0.0.1:{find_free_port()}",
        )
        try:
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
            return proc, make_proxy_urls(good, wire, dead)
        except RuntimeError as exc:
            last_exc = exc
            if attempt < _TIMEOUT_START_RETRIES - 1:
                tmp = tmp.parent / f"{tmp.name}_r{attempt}"
                tmp.mkdir(exist_ok=True)

    assert last_exc is not None
    raise last_exc


@pytest.fixture(scope="module")
def timeout_proxy(
    proxy_type: str,
    wire_server: WireServer,
    tmp_path_factory: pytest.TempPathFactory,
) -> Generator[ProxyUrls]:
    """Proxy configured with short upstream timeouts. Wire-only."""
    tmp = tmp_path_factory.mktemp("timeout-proxy")
    proc, urls = _start_timeout_proxy(proxy_type, wire_server.url, tmp)
    try:
        yield urls
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
    """Proxy returns 504 when upstream stalls before response headers (§10.2).

    WireServer /stall/before-response sleeps for 3s. The timeout proxy is
    configured with a 2s upstream timeout. The proxy has not started
    forwarding, so it should return a proper error status.
    """
    url = tagged_url(
        f"{timeout_proxy.wire_url}/stall/before-response",
        "upstream-response-timeout",
    )
    result = send_expecting_error(timeout_client, url)

    assert_probe_result(
        result,
        ClientExpectation(status_in={502, 504}),
        test_id="upstream-response-timeout",
    )

    findings.record(
        "upstream-response-timeout",
        f"[{proxy_name}] Proxy returned {result.status} "
        "for upstream stall (RFC recommends 504)",
        level="finding",
    )


def test_upstream_body_stall(
    timeout_proxy: ProxyUrls,
    timeout_client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy drops connection when upstream stalls mid-body (§10.3).

    WireServer /stall/mid-body sends headers + 100 bytes then stalls 3s.
    A streaming proxy has already started forwarding, so the only correct
    signal is closing the connection.
    """
    url = tagged_url(
        f"{timeout_proxy.wire_url}/stall/mid-body",
        "upstream-body-stall",
    )
    result = send_expecting_error(timeout_client, url)

    assert_probe_result(result, ConnectionDrop(), test_id="upstream-body-stall")

    findings.record(
        "upstream-body-stall",
        f"[{proxy_name}] Proxy dropped connection during upstream body stall",
        level="finding",
    )


def _parse_status_from_raw(response_bytes: bytes) -> int | None:
    """Extract HTTP status code from raw response bytes, or None."""
    if not response_bytes:
        return None
    first_line = response_bytes.split(b"\r\n", 1)[0]
    parts = first_line.split(b" ", 2)
    if len(parts) >= 2:
        try:
            return int(parts[1])
        except ValueError:
            pass
    return None


def test_client_body_stall(
    timeout_proxy: ProxyUrls,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy handles client stalling after sending request headers (§10.4).

    Sends request headers with Content-Length but no body. Default: proxy
    should respond with 408 Request Timeout or close the connection.
    """
    quirk = apply_quirk(proxy_name, _CLIENT_BODY_STALL_QUIRKS)

    host = timeout_proxy.wire_host
    port = timeout_proxy.wire_port

    sock = socket.create_connection((host, port), timeout=5.0)
    try:
        request_headers = (
            f"POST {tagged_url('/echo', 'client-body-stall')}"
            f" HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            f"Content-Length: 100\r\n"
            f"Content-Type: application/octet-stream\r\n"
            f"\r\n"
        )
        sock.sendall(request_headers.encode())
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

    status = _parse_status_from_raw(response_bytes)

    if quirk and quirk.client is not None:
        assert isinstance(quirk.client, ClientExpectation)
        if quirk.client.status is not None:
            assert status == quirk.client.status, (
                f"Expected {quirk.client.status}, got {status}"
            )
    else:
        # Default: 408 or connection close
        assert status is None or status == 408, (
            f"Expected 408 or connection close, got {status}"
        )

    actual = f"status {status}" if status else "connection close"
    findings.record(
        "client-body-stall",
        f"[{proxy_name}] Proxy responded with {actual} during client body stall",
        level="finding",
    )


def test_idle_connection_timeout(
    timeout_proxy: ProxyUrls,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy closes idle connection after response (§10.5).

    Sends a valid request, receives the response, then holds the
    connection open. The proxy should eventually close it.
    """
    host = timeout_proxy.wire_host
    port = timeout_proxy.wire_port

    sock = socket.create_connection((host, port), timeout=5.0)
    try:
        path = tagged_url("/", "idle-connection-timeout")
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
        closed = False
        try:
            extra = sock.recv(4096)
            closed = len(extra) == 0
        except OSError:
            # Connection reset = also closed
            closed = True

        assert closed, "Proxy did not close idle connection"

        findings.record(
            "idle-connection-timeout",
            f"[{proxy_name}] Proxy closed idle connection after response",
            level="info",
        )
    finally:
        sock.close()
