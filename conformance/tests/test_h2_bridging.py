"""Tests for HTTP/1.1 → HTTP/2 bridging (§18).

Verifies that the proxy correctly translates HTTP/1.1 client requests into
HTTP/2 when forwarding to an h2c upstream:

- ``Host`` header → ``:authority`` pseudo-header
- ``Transfer-Encoding: chunked`` is stripped (H2 handles framing natively)
- Request method and path arrive as ``:method`` / ``:path`` pseudo-headers
"""

from __future__ import annotations

import httpx

from proxy_conformance.h2c_server import CapturedH2Request, H2cServer

from .conftest import Findings
from .proxies import ProxyUrls


def test_host_to_authority(
    proxy: ProxyUrls,
    proxy_name: str,
    client: httpx.Client,
    h2c_server: H2cServer,
    findings: Findings,
) -> None:
    """Proxy translates the H1.1 Host header into :authority on the upstream.

    RFC 7540 §8.1.2.3: when bridging to h2c, the proxy should derive
    :authority from the incoming Host header. Some proxies pass the host
    value as a regular header instead; this is recorded as a finding.
    """
    resp = client.get(
        f"{proxy.h2c_url}/",
        headers={"Host": "example.com"},
    )
    assert resp.status_code == 200

    captured: CapturedH2Request = h2c_server.last_request()
    authority = captured.pseudo_headers.get(":authority")
    if authority is None:
        findings.record(
            "18.1",
            f"[{proxy_name}] did not set :authority pseudo-header when bridging "
            f"to h2c; host value arrived as regular header: "
            f"{captured.headers.get('host')!r}",
            level="finding",
        )
        assert captured.headers.get("host") == "example.com"
    else:
        assert authority == "example.com"


def test_chunked_te_stripped(
    proxy: ProxyUrls,
    client: httpx.Client,
    h2c_server: H2cServer,
) -> None:
    """Proxy strips Transfer-Encoding when bridging a chunked body to h2c."""
    body = b"hello from h1.1 chunked"

    def _chunked() -> bytes:
        return body

    resp = client.post(
        f"{proxy.h2c_url}/",
        content=_chunked(),
        headers={"Content-Type": "application/octet-stream"},
    )
    assert resp.status_code == 200

    captured: CapturedH2Request = h2c_server.last_request()
    assert captured.body_length == len(body)
    assert "transfer-encoding" not in captured.headers


def test_request_method_path(
    proxy: ProxyUrls,
    client: httpx.Client,
    h2c_server: H2cServer,
) -> None:
    """Proxy preserves request method and path as H2 pseudo-headers."""
    resp = client.post(
        f"{proxy.h2c_url}/foo/bar",
        content=b"x",
    )
    assert resp.status_code == 200

    captured: CapturedH2Request = h2c_server.last_request()
    assert captured.pseudo_headers.get(":method") == "POST"
    assert captured.pseudo_headers.get(":path") == "/foo/bar"
