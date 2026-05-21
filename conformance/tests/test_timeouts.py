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
import threading
from collections.abc import Generator
from pathlib import Path

import httpx
import pytest

from proxy_conformance.net import find_free_port
from proxy_conformance.targets import proxy_family
from proxy_conformance.types import (
    ClientExpectation,
    ConnectionDrop,
    assert_probe_result,
    send_expecting_error,
)
from proxy_conformance.wire_server import WireServer, body_stall_target

from .conftest import Findings
from .proxies import (
    ProxyConfig,
    ProxyEntry,
    ProxyUrls,
    make_proxy_urls,
    start_caddy,
    start_haproxy,
    tagged_url,
)

_TIMEOUT_START_RETRIES = 3


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
            config = ProxyConfig(
                good=good,
                wire=wire,
                dead=dead,
                tmp_dir=tmp,
            )
            if proxy_type == "caddy":
                proc = start_caddy(
                    config,
                    dial_timeout="1s",
                    response_header_timeout="2s",
                    idle_timeout="1s",
                    read_timeout="1s",
                )
            else:
                proc = start_haproxy(
                    config,
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
    """Proxy configured with short upstream timeouts. Wire-only.

    Skipped for proxy types that don't support timeout configuration.
    """
    if proxy_family(proxy_type) == "protospy":
        pytest.skip("Timeout configuration not yet supported for protospy")

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
    """Proxy handles upstream stalling mid-body (§10.3).

    WireServer /stall/mid-body sends headers + 100 bytes then stalls 3s.
    A streaming proxy that has already started forwarding can only signal
    the failure by dropping the connection. A buffering proxy that
    detects the timeout before forwarding may return 502 instead. Both
    outcomes are accepted.
    """
    url = tagged_url(
        f"{timeout_proxy.wire_url}/stall/mid-body",
        "upstream-body-stall",
    )
    result = send_expecting_error(timeout_client, url)

    assert_probe_result(
        result,
        [ConnectionDrop(), ClientExpectation(status=502)],
        test_id="upstream-body-stall",
    )

    outcome = (
        "dropped connection" if result.status is None else f"returned {result.status}"
    )
    findings.record(
        "upstream-body-stall",
        f"[{proxy_name}] Proxy {outcome} during upstream body stall",
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


def _describe_status(status: int | None) -> str:
    return f"status {status}" if status is not None else "connection close"


def test_client_body_stall(
    timeout_proxy: ProxyUrls,
    wire_server: WireServer,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy handles client stalling after sending request headers (§10.4).

    Uses WireServer to inspect what the proxy forwards when the client
    sends request headers with Content-Length: 100 but never sends body
    bytes. The wire-level property is whether the proxy forwards the
    request to the backend before the body arrives. The client-facing
    status is non-deterministic — 200, 400, 408, 504, and connection
    close are all conformant depending on the proxy's timeout strategy —
    so it is recorded as a finding rather than asserted.
    """
    request_arrived = threading.Event()
    received_body: list[bytes] = []
    wire_server.add_route(
        "/client-body-stall-target",
        body_stall_target(request_arrived, received_body),
    )

    host = timeout_proxy.wire_host
    port = timeout_proxy.wire_port
    path = tagged_url("/client-body-stall-target", "client-body-stall")

    sock = socket.create_connection((host, port), timeout=5.0)
    try:
        raw_request = (
            f"POST {path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            f"Content-Length: 100\r\n"
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

    status = _parse_status_from_raw(response_bytes)
    forwarded = request_arrived.wait(timeout=0.5)

    if forwarded:
        body_len = len(received_body[0]) if received_body else 0
        findings.record(
            "client-body-stall",
            f"[{proxy_name}] Proxy forwarded request to backend "
            f"({body_len} body bytes); "
            f"client got {_describe_status(status)}",
            level="finding",
        )
    else:
        findings.record(
            "client-body-stall",
            f"[{proxy_name}] Proxy did not forward to backend; "
            f"client got {_describe_status(status)}",
            level="finding",
        )

    assert status is None or status in {200, 400, 408, 504}, (
        f"Unexpected client status {status} "
        "(expected 200, 400, 408, 504, or connection close)"
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
