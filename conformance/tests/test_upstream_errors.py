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

from proxy_conformance.types import (
    ClientExpectation,
    ConnectionDrop,
    ProxyQuirk,
    apply_quirk,
    assert_probe_result,
    send_expecting_error,
)

from .conftest import Findings
from .proxies import ProxyUrls, tagged_url

# §9.1: HAProxy returns 503 instead of 502 for unreachable upstream.
_UNREACHABLE_QUIRKS: dict[str, ProxyQuirk] = {
    "haproxy": ProxyQuirk(
        disposition="override",
        reason="Returns 503 Service Unavailable instead of 502 Bad Gateway",
        client=ClientExpectation(status=503),
    ),
}


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
    url = tagged_url(proxy.dead_url, "upstream-unreachable")
    result = send_expecting_error(client, url)

    quirk = apply_quirk(proxy_name, _UNREACHABLE_QUIRKS)
    expected = quirk.client if quirk and quirk.client else ClientExpectation(status=502)
    assert_probe_result(result, expected, test_id="upstream-unreachable")

    findings.record(
        "upstream-unreachable",
        f"[{proxy_name}] Proxy returned {result.status} "
        "for unreachable upstream (RFC recommends 502)",
        level="finding",
    )


def test_upstream_malformed_response(
    proxy: ProxyUrls,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy returns 502 when upstream sends non-HTTP bytes (§9.2).

    WireServer /garbage sends raw non-HTTP bytes ("NOT HTTP\\r\\n\\r\\n").
    The proxy has not started forwarding, so it can return a proper error.
    """
    url = tagged_url(f"{proxy.wire_url}/garbage", "upstream-malformed-response")
    result = send_expecting_error(client, url)

    assert_probe_result(
        result,
        ClientExpectation(status=502),
        test_id="upstream-malformed-response",
    )

    findings.record(
        "upstream-malformed-response",
        f"[{proxy_name}] Proxy returned {result.status} "
        "for malformed upstream response",
        level="finding",
    )


def test_upstream_drops_after_headers(
    proxy: ProxyUrls,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy handles upstream closing immediately after sending headers (§9.3).

    WireServer /truncated-empty sends Content-Length: 1000 headers but
    closes without sending any body. A streaming proxy has already started
    forwarding the response, so the only correct signal is closing the
    connection.
    """
    url = tagged_url(
        f"{proxy.wire_url}/truncated-empty",
        "upstream-drops-after-headers",
    )
    result = send_expecting_error(client, url)

    assert_probe_result(
        result,
        ConnectionDrop(),
        test_id="upstream-drops-after-headers",
    )

    findings.record(
        "upstream-drops-after-headers",
        f"[{proxy_name}] Proxy dropped connection when upstream closed after headers",
        level="finding",
    )


def test_upstream_drops_before_response(
    proxy: ProxyUrls,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy handles upstream closing before sending any response (§9.4).

    WireServer /silent accepts the request then closes the connection
    immediately without sending headers or body. The proxy has not started
    forwarding, so it should return 502.
    """
    url = tagged_url(f"{proxy.wire_url}/silent", "upstream-drops-before-response")
    result = send_expecting_error(client, url)

    assert_probe_result(
        result,
        ClientExpectation(status=502),
        test_id="upstream-drops-before-response",
    )

    findings.record(
        "upstream-drops-before-response",
        f"[{proxy_name}] Proxy returned {result.status} "
        "when upstream dropped before responding",
        level="finding",
    )


def test_upstream_content_length_mismatch(
    proxy: ProxyUrls,
    client: httpx.Client,
    findings: Findings,
    proxy_name: str,
) -> None:
    """Proxy handles upstream sending fewer bytes than Content-Length (§9.5).

    WireServer /truncated promises 1000 bytes but sends only 500.
    A streaming proxy has already started forwarding the response,
    so the only correct signal is closing the connection.
    """
    url = tagged_url(f"{proxy.wire_url}/truncated", "truncated-body")
    result = send_expecting_error(client, url)

    assert_probe_result(result, ConnectionDrop(), test_id="truncated-body")

    findings.record(
        "truncated-body",
        f"[{proxy_name}] Proxy dropped connection for truncated body (RFC 9112 §6.3)",
        level="finding",
    )
