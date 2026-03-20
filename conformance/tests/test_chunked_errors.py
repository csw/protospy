"""Protocol edge-case tests using the h11 low-level client.

These tests deliberately send malformed HTTP to observe proxy error
handling behavior.
"""

from __future__ import annotations

import queue
import urllib.parse

from proxy_conformance.good_server import GoodServer
from proxy_conformance.h11_client import send_incomplete_chunked_request
from proxy_conformance.types import ClientExpectation, ProxyQuirk, apply_quirk

from .conftest import Findings, ProxyUrls, _test_url

# Per-proxy behavioral quirks for the incomplete-chunked-request test.
#
# The correct behavior per RFC 9112 §7.1 is 400 Bad Request. Neither Caddy
# nor HAProxy returns 400:
#
# - Caddy: returns 200 or 502 non-deterministically due to a race condition
#   between context cancellation (client SHUT_WR) and upstream EOF. Marked
#   xfail — the RFC expectation is a 400 response. See:
#   docs/process/findings-caddy-pool-state-behavior.md
#   docs/process/findings-caddy-pool-state-behavior-code-analysis.md
#
# - HAProxy: drops the connection without sending any response. Marked as
#   override with status=None to assert that the connection drop is expected.
_QUIRKS: dict[str, ProxyQuirk] = {
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
        reason="Drops connection without sending any response (strict parser)",
        client=ClientExpectation(status=None),
    ),
}


class TestIncompleteChunkedRequest:
    """Proxy handling of a chunked request with a missing final chunk.

    RFC 9112 §7.1 defines chunked transfer coding. A chunked body is
    terminated by a zero-length chunk. If the client closes the
    connection without sending it, the message is incomplete.

    A proxy should detect this and respond with an error. It should
    ideally not forward the incomplete request to the target.
    """

    def test_proxy_returns_error(
        self,
        proxy: ProxyUrls,
        good_server: GoodServer,
        findings: Findings,
        proxy_name: str,
    ) -> None:
        """Proxy response to an incomplete chunked request is recorded as a finding."""
        result = send_incomplete_chunked_request(
            host=proxy.good_host,
            port=proxy.good_port,
            path=_test_url("/chunked-error-test", "incomplete-chunked-request"),
            chunk_data=b"this body is deliberately incomplete",
        )

        # Apply quirk: caddy -> xfail (never reaches here), haproxy -> override
        quirk = apply_quirk(proxy_name, _QUIRKS)

        expects_connection_drop = (
            quirk is not None
            and quirk.client is not None
            and quirk.client.status is None
        )
        if expects_connection_drop:
            # Connection drop is the expected behavior for this proxy.
            assert result is None, (
                f"[{proxy_name}] Expected connection drop, "
                f"but proxy returned status {result.status if result else '?'}"
            )
            findings.record(
                "incomplete-chunked-request",
                f"[{proxy_name}] Proxy dropped connection without response "
                f"for incomplete chunked request (RFC 9112 §7.1 expects 400)",
                level="finding",
            )
            return

        # RFC-correct path: proxy should respond (ideally 400).
        assert result is not None, "Proxy closed connection with no response"

        findings.record(
            "incomplete-chunked-request",
            f"Proxy returned {result.status} for incomplete "
            f"chunked request (expected 400 per RFC 9112 §7.1)",
            level="finding",
        )

        # Did the proxy forward anything to the target?
        # This is informational — either behavior is plausible
        # depending on whether the proxy buffers or streams.
        try:
            captured = good_server.last_request(timeout=0.5)
            findings.record(
                "incomplete-chunked-request",
                f"Target received {captured.method} "
                f"{captured.path} with {len(captured.body)} bytes "
                f"(proxy buffered and forwarded incomplete body)",
                level="finding",
            )
        except queue.Empty:
            findings.record(
                "incomplete-chunked-request",
                "Target received no request (proxy rejected before forwarding)",
                level="info",
            )


class TestH11ClientIntegration:
    """Verify the h11 client helper works at all, separate from proxy
    behavior. Sends an incomplete request directly to the echo server
    to confirm socket-level mechanics.
    """

    def test_direct_to_good_server(
        self, good_server: GoodServer, findings: Findings
    ) -> None:
        """Echo server receives partial data when client drops early."""
        parsed = urllib.parse.urlparse(good_server.url)
        assert parsed.hostname is not None
        assert parsed.port is not None

        # The echo server is a normal aiohttp server — it may or may
        # not handle the incomplete chunked request gracefully. This
        # test just verifies our h11 client doesn't crash and can
        # read/parse whatever response comes back.
        result = send_incomplete_chunked_request(
            host=parsed.hostname,
            port=parsed.port,
            path="/direct-test",
            chunk_data=b"hello",
        )

        # We should get *some* result (either a response or None).
        # The specific behavior depends on aiohttp's error handling
        # for truncated chunked bodies.
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

        # Drain any request the echo server may have captured.
        try:
            good_server.last_request(timeout=0.5)
        except queue.Empty:
            pass
