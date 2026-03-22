"""Upstream error handling conformance tests (category 9).

§9.1: Proxy returns 5xx when upstream is unreachable.
§9.2: Proxy returns 5xx for malformed upstream response.
§9.3: Proxy handles upstream closing connection immediately after headers.
§9.4: Proxy handles upstream closing before sending any response.
§9.5: Proxy handles upstream content-length mismatch (sends fewer bytes).

Absorbs truncated-body and malformed-chunks tests from test_wire_server.py
(TestTruncatedBody, TestMalformedChunks).
"""

from __future__ import annotations

import httpx

from proxy_conformance.types import send_expecting_error

from .conftest import Findings, ProxyUrls, _test_url


def test_upstream_unreachable(
    proxy: ProxyUrls,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy returns 5xx when upstream is unreachable (§9.1).

    Uses the dead proxy endpoint which forwards to a port with nothing bound.
    RFC 7231 §6.6.3 recommends 502 Bad Gateway.
    """
    url = _test_url(proxy.dead_url, "upstream-unreachable")
    result = send_expecting_error(client, url)

    if result.status is None:
        findings.record(
            "upstream-unreachable",
            f"[{proxy_name}] Proxy closed connection without response "
            "for unreachable upstream (expected 502)",
            level="finding",
        )
    else:
        findings.record(
            "upstream-unreachable",
            f"[{proxy_name}] Proxy returned {result.status} for unreachable upstream",
            level="finding",
        )
        assert result.status >= 500, (
            f"Expected 5xx for unreachable upstream, got {result.status}"
        )


def test_upstream_malformed_response(
    proxy: ProxyUrls,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy returns 5xx when upstream sends non-HTTP bytes (§9.2). Findings-based.

    WireServer /garbage sends raw non-HTTP bytes ("NOT HTTP\\r\\n\\r\\n").
    A conforming proxy should return 502.
    """
    url = _test_url(f"{proxy.wire_url}/garbage", "upstream-malformed-response")
    result = send_expecting_error(client, url)

    if result.status is None:
        findings.record(
            "upstream-malformed-response",
            f"[{proxy_name}] Proxy closed connection without response "
            "for malformed upstream response (expected 502)",
            level="finding",
        )
    else:
        findings.record(
            "upstream-malformed-response",
            f"[{proxy_name}] Proxy returned {result.status} for malformed upstream",
            level="finding",
        )
        assert result.status >= 500, (
            f"Expected 5xx for malformed upstream, got {result.status}"
        )


def test_upstream_drops_after_headers(
    proxy: ProxyUrls,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy handles upstream closing immediately after sending headers (§9.3).

    WireServer /truncated-empty sends Content-Length: 1000 headers but
    closes the connection without sending any body bytes. Findings-based.
    """
    url = _test_url(f"{proxy.wire_url}/truncated-empty", "upstream-drops-after-headers")
    result = send_expecting_error(client, url)

    if result.status is None:
        findings.record(
            "upstream-drops-after-headers",
            f"[{proxy_name}] Proxy closed connection without response "
            "when upstream dropped after headers (expected 502)",
            level="finding",
        )
    else:
        findings.record(
            "upstream-drops-after-headers",
            f"[{proxy_name}] Proxy returned {result.status} "
            "when upstream dropped after headers",
            level="finding",
        )
        assert result.status >= 500, (
            f"Expected 5xx when upstream dropped after headers, got {result.status}"
        )


def test_upstream_drops_before_response(
    proxy: ProxyUrls,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy handles upstream closing before sending any response (§9.4).

    WireServer /silent accepts the request then closes the connection
    immediately without sending headers or body. Findings-based.
    """
    url = _test_url(f"{proxy.wire_url}/silent", "upstream-drops-before-response")
    result = send_expecting_error(client, url)

    if result.status is None:
        findings.record(
            "upstream-drops-before-response",
            f"[{proxy_name}] Proxy closed connection without response "
            "when upstream dropped before responding (expected 502)",
            level="finding",
        )
    else:
        findings.record(
            "upstream-drops-before-response",
            f"[{proxy_name}] Proxy returned {result.status} "
            "when upstream dropped before responding",
            level="finding",
        )
        assert result.status >= 500, (
            f"Expected 5xx when upstream dropped before responding, got {result.status}"
        )


def test_upstream_content_length_mismatch(
    proxy: ProxyUrls,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy handles upstream sending fewer bytes than Content-Length promises (§9.5).

    Absorbed from test_wire_server.py (TestTruncatedBody).
    WireServer /truncated promises 1000 bytes but sends only 500.
    RFC 9112 §6.3 considers this an incomplete message; proxy should return 502.
    """
    url = _test_url(f"{proxy.wire_url}/truncated", "truncated-body")
    result = send_expecting_error(client, url)

    if result.status is None:
        findings.record(
            "truncated-body",
            f"[{proxy_name}] Proxy closed connection without a response "
            "for truncated body (expected 502 per RFC 9112 §6.3)",
            level="finding",
        )
    else:
        findings.record(
            "truncated-body",
            f"[{proxy_name}] Proxy returned {result.status} for truncated body",
            level="finding",
        )
        assert result.status >= 500
