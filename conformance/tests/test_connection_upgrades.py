"""Proxy conformance tests for connection upgrades — WebSocket (§15).

Tests that the proxy correctly handles the HTTP/1.1 Upgrade mechanism
for WebSocket connections (RFC 6455, RFC 9110 §7.8).

§15.1: Successful WebSocket upgrade through the proxy.
§15.2: Failed upgrade — server rejects with non-101 status.
§15.3: Bidirectional data flow after upgrade.
"""

from __future__ import annotations

import httpx
import pytest
from websockets.sync.client import connect as ws_connect

from .proxies import ProxyUrls, tagged_url


@pytest.mark.xfail_for("protospy")
def test_websocket_upgrade(
    proxy: ProxyUrls,
) -> None:
    """Proxy relays WebSocket upgrade and tunnels the connection (§15.1)."""
    with ws_connect(f"ws://{proxy.good_host}:{proxy.good_port}/ws/echo") as ws:
        ws.send("hello")
        assert ws.recv() == "hello"


def test_websocket_upgrade_rejected(
    proxy: ProxyUrls,
    client: httpx.Client,
) -> None:
    """Proxy forwards server's rejection of WebSocket upgrade (§15.2).

    The upstream returns 403 for /ws/reject. The proxy should forward
    that status rather than generating its own 502/504.
    """
    url = tagged_url(
        f"{proxy.good_url}/ws/reject",
        "websocket-upgrade-rejected",
    )
    response = client.get(url)
    assert response.status_code == 403


@pytest.mark.xfail_for("protospy")
def test_websocket_bidirectional(
    proxy: ProxyUrls,
) -> None:
    """Bidirectional data flow after WebSocket upgrade (§15.3).

    Sends multiple text and binary messages through the proxy to
    verify sustained tunneling.
    """
    with ws_connect(f"ws://{proxy.good_host}:{proxy.good_port}/ws/echo") as ws:
        # Multiple text messages
        for i in range(5):
            msg = f"message {i}"
            ws.send(msg)
            assert ws.recv() == msg

        # Binary message
        binary_data = bytes(range(256))
        ws.send(binary_data)
        assert ws.recv() == binary_data
