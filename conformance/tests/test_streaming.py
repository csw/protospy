"""Tests for streaming response behavior (§19).

Verifies that the proxy forwards response chunks incrementally as they
arrive from upstream rather than buffering the full response, and that
it tears down the upstream connection when the client disconnects
mid-stream.

Tests use a deterministic gating mechanism (threading.Events) rather
than timing sleeps:

1. WireServer handler sends chunk N, then blocks on gate N.
2. Client reads chunk N and sets gate N.
3. Gate N release lets the handler send chunk N+1.

If the proxy buffers the full response the client never receives chunk 0
(the handler is blocked waiting for a gate only the client can set),
so ``httpx`` raises ``ReadTimeout`` within the configured read timeout.
"""

from __future__ import annotations

import socket
import threading

import h11
import httpx

from proxy_conformance.wire_server import WireServer, gated_chunks

from .proxies import ProxyUrls


def test_chunked_stream_not_buffered(
    proxy: ProxyUrls,
    wire_server: WireServer,
) -> None:
    """Proxy forwards each chunk before the next one exists.

    Three chunks are sent by the upstream one at a time, each gated on
    an event that the client sets after receiving the previous chunk.
    A buffering proxy would cause ``httpx`` to raise ``ReadTimeout``
    because the response never completes (the handler waits for a gate
    that is never set).
    """
    chunks = [b"alpha-chunk", b"beta-chunk", b"gamma-chunk"]
    gates = [threading.Event() for _ in chunks]
    boundaries = [sum(len(c) for c in chunks[: i + 1]) for i in range(len(chunks))]

    wire_server.add_route("/stream-gated", gated_chunks(chunks, gates))

    received = bytearray()
    gate_idx = 0

    with httpx.Client(trust_env=False) as c:
        with c.stream(
            "GET",
            f"{proxy.wire_url}/stream-gated",
            timeout=httpx.Timeout(5.0),
        ) as resp:
            assert resp.status_code == 200
            for raw in resp.iter_raw():
                received.extend(raw)
                # Set every gate whose chunk boundary we have now crossed.
                # Handles the case where iter_raw() coalesces multiple
                # chunks into a single yield.
                while gate_idx < len(gates) and len(received) >= boundaries[gate_idx]:
                    gates[gate_idx].set()
                    gate_idx += 1

    assert bytes(received) == b"".join(chunks)


def test_client_disconnect_closes_upstream(
    proxy: ProxyUrls,
    wire_server: WireServer,
) -> None:
    """Proxy closes the upstream connection when the client disconnects.

    The client reads the first chunk then drops the connection. The test
    then releases the handler gate so the handler can keep sending data.
    A well-behaved proxy closes the upstream socket once it detects the
    client is gone; with the handler sending continuously, the next
    upstream ``sendall`` raises ``OSError`` and sets ``upstream_closed``.
    """
    gate = threading.Event()
    upstream_closed = threading.Event()
    filler = b"x" * 8192  # 8 KB per send

    def _handler(
        _request: h11.Request,
        _body: bytes,
        conn: socket.socket,
        _h11_conn: h11.Connection,
    ) -> None:
        try:
            conn.sendall(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n")
            first = b"first-chunk"
            conn.sendall(f"{len(first):x}\r\n".encode() + first + b"\r\n")
            # Wait for client to disconnect (gate is set by the test after
            # the client's streaming context manager exits).
            assert gate.wait(timeout=10.0), "Timed out waiting for client disconnect"

            # Keep sending until the proxy closes the upstream connection.
            while True:
                conn.sendall(f"{len(filler):x}\r\n".encode() + filler + b"\r\n")
        except OSError:
            upstream_closed.set()

    wire_server.add_route("/stream-disconnect", _handler)

    with httpx.Client(trust_env=False) as c:
        with c.stream(
            "GET",
            f"{proxy.wire_url}/stream-disconnect",
            timeout=httpx.Timeout(5.0),
        ) as resp:
            assert resp.status_code == 200
            for _ in resp.iter_raw():
                break  # Read one batch, then let the context manager close

    # Unblock the handler so it starts sending and can detect the closed
    # upstream connection.
    gate.set()

    assert upstream_closed.wait(timeout=5.0), (
        "Upstream connection was not closed after client disconnected"
    )
