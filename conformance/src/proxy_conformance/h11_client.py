"""Low-level HTTP client using h11 for protocol edge-case testing.

h11 is used to construct well-formed HTTP framing up to the point where
we deliberately introduce a protocol violation. Response parsing uses
manual HTTP/1.1 parsing because h11's state machine won't read a
response while it thinks the request body is still in progress.
"""

from __future__ import annotations

import socket
from dataclasses import dataclass

import h11


@dataclass
class RawResponse:
    """A minimally-parsed HTTP response."""

    status: int
    headers: dict[str, list[str]]
    body: bytes


def send_incomplete_chunked_request(
    host: str,
    port: int,
    path: str = "/",
    chunk_data: bytes = b"partial data",
    timeout: float = 5.0,
) -> RawResponse | None:
    """Send a chunked POST that omits the final zero-length chunk.

    Uses h11 to construct proper HTTP framing for the request line,
    headers, and one data chunk. Then closes the write side of the
    socket WITHOUT sending the terminating empty chunk.

    Returns the proxy's response, or None if the connection was closed
    with no response.
    """
    conn = h11.Connection(h11.CLIENT)

    sock = socket.create_connection((host, port), timeout=timeout)
    try:
        # Send request headers. h11 handles the request line and
        # header formatting.
        request = h11.Request(
            method="POST",
            target=path,
            headers=[
                ("Host", f"{host}:{port}"),
                ("Transfer-Encoding", "chunked"),
            ],
        )
        sock.sendall(conn.send(request))

        # Send one properly-framed chunk. h11 produces the chunk
        # length prefix and trailing CRLF.
        sock.sendall(conn.send(h11.Data(data=chunk_data)))

        # DELIBERATE PROTOCOL VIOLATION: do NOT send
        # conn.send(h11.EndOfMessage()), which would produce the
        # final "0\r\n\r\n" chunk. Instead, close the write side.
        sock.shutdown(socket.SHUT_WR)

        # Read whatever the proxy sends back.
        response_bytes = b""
        while True:
            data = sock.recv(4096)
            if not data:
                break
            response_bytes += data
    finally:
        sock.close()

    if not response_bytes:
        return None

    return _parse_raw_response(response_bytes)


def _parse_raw_response(data: bytes) -> RawResponse:
    """Parse a raw HTTP/1.1 response into status, headers, and body.

    This is intentionally minimal — just enough to extract the status
    code and headers for assertion purposes.
    """
    header_end = data.find(b"\r\n\r\n")
    if header_end == -1:
        msg = f"No header terminator found in response: {data[:200]!r}"
        raise ValueError(msg)

    header_section = data[:header_end].decode("latin-1")
    body = data[header_end + 4 :]

    lines = header_section.split("\r\n")
    status_line = lines[0]
    # e.g. "HTTP/1.1 400 Bad Request"
    parts = status_line.split(" ", 2)
    status = int(parts[1])

    headers: dict[str, list[str]] = {}
    for line in lines[1:]:
        name, _, value = line.partition(": ")
        headers.setdefault(name.lower(), []).append(value)

    return RawResponse(status=status, headers=headers, body=body)
