"""Direct aiohttp test: compare incomplete chunked request behavior
on fresh vs reused connections.

Bypasses Caddy entirely. Connects directly to GoodServer (aiohttp).

Usage:
    cd conformance
    uv run good-server -p 9100 --log &
    uv run python scripts/direct_aiohttp_test.py
"""

from __future__ import annotations

import socket
import sys
import time

import h11


def recv_full_response(sock: socket.socket, timeout: float = 5.0) -> bytes:
    """Read a complete HTTP response from the socket.

    Parses Content-Length or chunked Transfer-Encoding to know when the
    response body ends, so we can safely reuse the connection.
    """
    sock.settimeout(timeout)
    raw = b""

    # Read until we have headers
    while b"\r\n\r\n" not in raw:
        chunk = sock.recv(4096)
        if not chunk:
            return raw
        raw += chunk

    header_end = raw.index(b"\r\n\r\n")
    header_section = raw[:header_end].decode("latin-1")
    body_so_far = raw[header_end + 4 :]

    # Parse headers
    lines = header_section.split("\r\n")
    headers: dict[str, str] = {}
    for line in lines[1:]:
        name, _, value = line.partition(": ")
        headers[name.lower()] = value

    if "content-length" in headers:
        expected = int(headers["content-length"])
        while len(body_so_far) < expected:
            chunk = sock.recv(4096)
            if not chunk:
                break
            body_so_far += chunk
        return raw[: header_end + 4] + body_so_far

    if headers.get("transfer-encoding", "").lower() == "chunked":
        # Read chunked body until terminal 0\r\n\r\n
        while not body_so_far.endswith(b"0\r\n\r\n"):
            chunk = sock.recv(4096)
            if not chunk:
                break
            body_so_far += chunk
        return raw[: header_end + 4] + body_so_far

    return raw


def send_incomplete_chunked(
    sock: socket.socket, host: str, port: int, path: str
) -> bytes:
    """Send an incomplete chunked POST (no terminal chunk) and read response."""
    conn = h11.Connection(h11.CLIENT)

    request = h11.Request(
        method="POST",
        target=path,
        headers=[
            ("Host", f"{host}:{port}"),
            ("Transfer-Encoding", "chunked"),
        ],
    )
    sock.sendall(conn.send(request))
    sock.sendall(conn.send(h11.Data(data=b"partial data")))

    # DELIBERATE VIOLATION: close write side without sending terminal chunk
    sock.shutdown(socket.SHUT_WR)

    response = b""
    sock.settimeout(5.0)
    try:
        while True:
            data = sock.recv(4096)
            if not data:
                break
            response += data
    except TimeoutError:
        pass

    return response


def send_normal_get(sock: socket.socket, host: str, port: int, path: str) -> bytes:
    """Send a well-formed GET request and read the complete response."""
    conn = h11.Connection(h11.CLIENT)

    request = h11.Request(
        method="GET",
        target=path,
        headers=[
            ("Host", f"{host}:{port}"),
            ("Connection", "keep-alive"),
        ],
    )
    sock.sendall(conn.send(request))
    sock.sendall(conn.send(h11.EndOfMessage()))

    return recv_full_response(sock)


def parse_status(raw: bytes) -> int | None:
    if not raw:
        return None
    line = raw.split(b"\r\n", 1)[0].decode("latin-1")
    parts = line.split(" ", 2)
    if len(parts) >= 2:
        return int(parts[1])
    return None


def run(host: str = "127.0.0.1", port: int = 9100) -> None:
    print(f"=== Direct aiohttp test: {host}:{port} ===\n")

    # --- Case 1: Fresh connection → incomplete chunked POST ---
    print("--- Case 1: Fresh connection → incomplete chunked POST ---")
    with socket.create_connection((host, port), timeout=5.0) as sock:
        raw1 = send_incomplete_chunked(sock, host, port, "/echo/fresh-connection")

    status1 = parse_status(raw1)
    print(f"Response status: {status1}")
    print(f"Raw response:\n{raw1.decode('latin-1', errors='replace')}")
    print()

    time.sleep(0.2)

    # --- Case 2: Reused connection → GET then incomplete chunked POST ---
    print("--- Case 2: Reused connection → GET first, then incomplete chunked POST ---")
    with socket.create_connection((host, port), timeout=5.0) as sock:
        print("  Sending well-formed GET to warm the connection...")
        raw_get = send_normal_get(sock, host, port, "/echo/warmup")
        status_get = parse_status(raw_get)
        print(f"  GET response status: {status_get}")

        print("  Sending incomplete chunked POST on same connection...")
        raw2 = send_incomplete_chunked(sock, host, port, "/echo/reused-connection")

    status2 = parse_status(raw2)
    print(f"Response status: {status2}")
    print(f"Raw response:\n{raw2.decode('latin-1', errors='replace')}")
    print()

    # --- Summary ---
    print("=== Summary ===")
    print(f"  Fresh connection → incomplete chunked POST: HTTP {status1}")
    print(f"  Reused connection → GET then incomplete chunked POST: HTTP {status2}")

    if status1 == status2:
        print("\nResult: aiohttp responds IDENTICALLY on fresh and reused connections.")
        print("=> The 200 vs 502 difference originates in Caddy, not aiohttp.")
    else:
        print(f"\nResult: aiohttp responds DIFFERENTLY ({status1} vs {status2}).")
        print("=> aiohttp itself behaves differently on reused connections.")
        print("   This may explain the 200 vs 502 difference observed through Caddy.")


if __name__ == "__main__":
    host = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 9100
    run(host, port)
