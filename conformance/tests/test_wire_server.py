"""Proxy conformance tests using WireServer to simulate target misbehavior.

These tests validate how the proxy handles upstream protocol violations.
Results are documented as findings rather than strict RFC assertions,
since proxy behavior for upstream errors varies.

## Standalone debugging

To use WireServer for ad hoc testing with a real proxy:

    uv run wire-server -p 8515 --log

Then configure the proxy to forward to http://127.0.0.1:8515 and send
requests to the registered paths:

    /truncated        — response body shorter than Content-Length promises
    /malformed-chunks — chunked framing with an invalid chunk-size field
    /                 — simple 200 OK (default echo-like handler)
"""

from __future__ import annotations

import httpx

from proxy_conformance.types import send_expecting_error

from .conftest import Findings, ProxyUrls, _test_url


class TestTruncatedBody:
    """Proxy handling when upstream closes before sending promised body bytes.

    The upstream promises Content-Length: 1000 but closes the connection
    after 500 bytes. RFC 9112 §6.3 considers this an incomplete message.

    A proxy could return 502 Bad Gateway, or — if already streaming the
    response — close the client connection when the upstream drops.
    """

    def test_proxy_responds_with_error(
        self, proxy: ProxyUrls, client: httpx.Client, findings: Findings
    ) -> None:
        """Proxy signals an error when upstream closes mid-body."""
        url = _test_url(f"{proxy.wire_url}/truncated", "truncated-body")
        result = send_expecting_error(client, url)

        if result.status is None:
            findings.record(
                "truncated-body",
                "Proxy closed connection without sending a response "
                "for truncated body (expected 502 per RFC 9112 §6.3)",
                level="finding",
            )
        else:
            findings.record(
                "truncated-body",
                f"Proxy returned {result.status} for truncated body",
                level="finding",
            )
            assert result.status >= 500
        # Handler exception is checked automatically by _check_wire_server fixture.


class TestMalformedChunks:
    """Proxy handling when upstream sends invalid chunked framing.

    The upstream sends a chunk-size field of "ZZZZ" instead of a valid
    hex number. RFC 9112 §7.1 requires chunk-size to be hex digits.

    A proxy that detects the framing error should return 502 Bad Gateway.
    """

    def test_proxy_responds_with_error(
        self, proxy: ProxyUrls, client: httpx.Client, findings: Findings
    ) -> None:
        """Proxy signals an error when upstream sends invalid chunked framing."""
        url = _test_url(f"{proxy.wire_url}/malformed-chunks", "malformed-chunks")
        result = send_expecting_error(client, url)

        if result.status is None:
            findings.record(
                "malformed-chunks",
                "Proxy closed connection without sending a response "
                "for malformed chunked framing (expected 502 per RFC 9112 §7.1)",
                level="finding",
            )
        else:
            findings.record(
                "malformed-chunks",
                f"Proxy returned {result.status} for malformed chunks",
                level="finding",
            )
            assert result.status >= 500
        # Handler exception is checked automatically by _check_wire_server fixture.
