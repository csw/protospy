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


@dataclass
class ContinueResponse:
    """Result of a request with Expect: 100-continue."""

    got_100: bool  # True if 100 Continue was received before final response
    final: RawResponse  # The final (non-1xx) response


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


def send_with_expect_continue(
    host: str,
    port: int,
    path: str = "/",
    body: bytes = b"request body",
    timeout: float = 5.0,
    wait_for_100: bool = True,
) -> ContinueResponse:
    """Send a POST with Expect: 100-continue.

    Uses h11 on the client side for state machine management.

    When wait_for_100=True (default):
    1. Send Request with Expect: 100-continue and Content-Length
    2. Read events — expect InformationalResponse(100) or a final Response
    3. If 100: send body (Data + EndOfMessage), then read final Response
    4. If final Response directly (e.g., 417): don't send body
    5. Return ContinueResponse with got_100 flag and final response

    When wait_for_100=False:
    1. Send Request with Expect: 100-continue and Content-Length
    2. Immediately send body (Data + EndOfMessage) without waiting
    3. Read all response events — may include InformationalResponse before
       the final Response, or just a final Response
    4. Return ContinueResponse with got_100 flag and final response
    """
    conn = h11.Connection(h11.CLIENT)

    sock = socket.create_connection((host, port), timeout=timeout)
    try:
        sock.sendall(
            conn.send(
                h11.Request(
                    method="POST",
                    target=path,
                    headers=[
                        ("Host", f"{host}:{port}"),
                        ("Expect", "100-continue"),
                        ("Content-Length", str(len(body))),
                        ("Content-Type", "application/octet-stream"),
                    ],
                )
            )
        )

        got_100 = False

        if not wait_for_100:
            # Send body immediately without waiting for 100.
            sock.sendall(conn.send(h11.Data(data=body)))
            sock.sendall(conn.send(h11.EndOfMessage()))
        else:
            # Read until we get an InformationalResponse or a final Response.
            while True:
                event = conn.next_event()
                if event is h11.NEED_DATA:
                    data = sock.recv(65536)
                    conn.receive_data(data)
                elif isinstance(event, h11.InformationalResponse):
                    got_100 = True
                    break
                elif isinstance(event, h11.Response):
                    # Final response without 100 — don't send body.
                    response_body = b""
                    while True:
                        evt = conn.next_event()
                        if evt is h11.NEED_DATA:
                            chunk = sock.recv(65536)
                            conn.receive_data(chunk)
                        elif isinstance(evt, h11.Data):
                            response_body += evt.data
                        elif isinstance(evt, h11.EndOfMessage):
                            break
                    headers: dict[str, list[str]] = {}
                    for name, value in event.headers:
                        headers.setdefault(name.decode().lower(), []).append(
                            value.decode()
                        )
                    return ContinueResponse(
                        got_100=False,
                        final=RawResponse(
                            status=event.status_code,
                            headers=headers,
                            body=response_body,
                        ),
                    )

            # Received 100 — send body, then read final response.
            sock.sendall(conn.send(h11.Data(data=body)))
            sock.sendall(conn.send(h11.EndOfMessage()))

        # Read final response (and optional leading InformationalResponse).
        final_response: h11.Response | None = None
        final_body = b""
        while True:
            event = conn.next_event()
            if event is h11.NEED_DATA:
                data = sock.recv(65536)
                conn.receive_data(data)
            elif isinstance(event, h11.InformationalResponse):
                got_100 = True
            elif isinstance(event, h11.Response):
                final_response = event
            elif isinstance(event, h11.Data):
                final_body += event.data
            elif isinstance(event, h11.EndOfMessage):
                break

        if final_response is None:
            msg = "No final response received after sending body"
            raise RuntimeError(msg)

        resp_headers: dict[str, list[str]] = {}
        for name, value in final_response.headers:
            resp_headers.setdefault(name.decode().lower(), []).append(value.decode())

        return ContinueResponse(
            got_100=got_100,
            final=RawResponse(
                status=final_response.status_code,
                headers=resp_headers,
                body=final_body,
            ),
        )
    finally:
        sock.close()


def _read_response(sock: socket.socket, conn: h11.Connection) -> RawResponse | None:
    """Read bytes from the socket until a complete response is available.

    Returns the parsed RawResponse, or None if the connection closed with
    no data.
    """
    response_bytes = b""
    while True:
        try:
            data = sock.recv(4096)
        except OSError:
            break
        if not data:
            break
        response_bytes += data

    if not response_bytes:
        return None

    return _parse_raw_response(response_bytes)


def send_invalid_chunk_size(
    host: str,
    port: int,
    path: str = "/",
    timeout: float = 5.0,
) -> RawResponse | None:
    """Send a chunked POST with a non-hex chunk size field (ZZZZ\\r\\n).

    Bypasses h11 validation by writing raw bytes after the headers.
    Returns the proxy's response, or None if the connection was closed.
    """
    conn = h11.Connection(our_role=h11.CLIENT)
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        # Send valid request headers
        sock.sendall(
            conn.send(
                h11.Request(
                    method="POST",
                    target=path,
                    headers=[
                        ("host", host),
                        ("transfer-encoding", "chunked"),
                    ],
                )
            )
        )
        # Send invalid chunk size field directly (bypasses h11)
        sock.sendall(b"ZZZZ\r\nhello\r\n0\r\n\r\n")
        return _read_response(sock, conn)


def send_raw_request_line(
    host: str,
    port: int,
    request_line: str,
    timeout: float = 5.0,
) -> RawResponse | None:
    """Send an arbitrary request line, bypassing h11's URL validation.

    Useful for testing requests with fragments (GET /path#frag HTTP/1.1).
    Sends the request line + minimal Host header, then reads the response.
    Returns None if the connection was closed without a response.
    """
    raw = (f"{request_line}\r\nHost: {host}\r\n\r\n").encode()
    conn = h11.Connection(our_role=h11.CLIENT)
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        sock.sendall(raw)
        return _read_response(sock, conn)


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
