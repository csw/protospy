"""Low-level HTTP client using h11 for protocol edge-case testing.

h11 is used to construct well-formed HTTP framing up to the point where
we deliberately introduce a protocol violation. Response parsing uses
manual HTTP/1.1 parsing because h11's state machine won't read a
response while it thinks the request body is still in progress.
"""

from __future__ import annotations

import socket
import time
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


def _read_complete_response(sock: socket.socket) -> bytes:
    """Read exactly one complete HTTP/1.1 response from the socket.

    Parses response framing (Content-Length or Transfer-Encoding: chunked)
    to detect the end of the response body without waiting for the server
    to close the connection. Falls back to reading until EOF when neither
    framing mechanism is present (HTTP/1.0-style or Connection: close).

    Returns the raw bytes of the complete response (headers + body), which
    may be empty if the connection was closed before any data arrived.
    """
    buf = b""

    # --- Phase 1: read until we have the full header block ---
    while b"\r\n\r\n" not in buf:
        try:
            chunk = sock.recv(4096)
        except OSError:
            return buf
        if not chunk:
            return buf
        buf += chunk

    header_end = buf.index(b"\r\n\r\n")
    header_section = buf[:header_end].decode("latin-1")
    body_start = buf[header_end + 4 :]

    # Parse headers to determine body framing.
    lines = header_section.split("\r\n")
    headers: dict[str, str] = {}
    for line in lines[1:]:
        name, _, value = line.partition(":")
        headers[name.strip().lower()] = value.strip()

    # Check for Transfer-Encoding: chunked.
    te = headers.get("transfer-encoding", "")
    if "chunked" in te.lower():
        return buf[: header_end + 4] + _read_chunked_body(sock, body_start)

    # Check for Content-Length.
    cl_raw = headers.get("content-length")
    if cl_raw is not None:
        try:
            content_length = int(cl_raw)
        except ValueError:
            content_length = 0
        body = body_start
        while len(body) < content_length:
            try:
                chunk = sock.recv(4096)
            except OSError:
                break
            if not chunk:
                break
            body += chunk
        return buf[: header_end + 4] + body[:content_length]

    # No framing info — fall back to reading until EOF.
    body = body_start
    while True:
        try:
            chunk = sock.recv(4096)
        except OSError:
            break
        if not chunk:
            break
        body += chunk
    return buf[: header_end + 4] + body


def _read_chunked_body(sock: socket.socket, initial: bytes) -> bytes:
    """Read a chunked response body, returning the raw chunk-encoded bytes.

    Reads until the zero-length terminating chunk (``0\\r\\n\\r\\n``) is
    seen or the connection closes.
    """
    buf = initial
    while True:
        # Try to parse the next chunk-size line from buf.
        crlf = buf.find(b"\r\n")
        if crlf == -1:
            # Need more data to find the chunk-size line.
            try:
                chunk = sock.recv(4096)
            except OSError:
                return buf
            if not chunk:
                return buf
            buf += chunk
            continue

        size_field = buf[:crlf].split(b";")[0].strip()
        try:
            chunk_size = int(size_field, 16)
        except ValueError:
            # Unparseable chunk size — return what we have.
            return buf

        # We need: size line + CRLF + chunk_size bytes + CRLF.
        chunk_end = crlf + 2 + chunk_size + 2
        while len(buf) < chunk_end:
            try:
                data = sock.recv(4096)
            except OSError:
                return buf
            if not data:
                return buf
            buf += data

        if chunk_size == 0:
            # Zero-length chunk — read optional trailers until \r\n\r\n.
            trailer_end = buf.find(b"\r\n\r\n", crlf + 2)
            while trailer_end == -1:
                try:
                    data = sock.recv(4096)
                except OSError:
                    return buf
                if not data:
                    return buf
                buf += data
                trailer_end = buf.find(b"\r\n\r\n", crlf + 2)
            return buf[: trailer_end + 4]

        # Advance past this chunk.
        buf = buf[crlf + 2 + chunk_size + 2 :]


def _read_response(sock: socket.socket) -> RawResponse | None:
    """Read bytes from the socket until a complete response is available.

    Uses HTTP/1.1 response framing (Content-Length or Transfer-Encoding:
    chunked) to stop reading as soon as the full response body has arrived,
    without waiting for the server to close the connection. Falls back to
    EOF-based reading when no framing header is present.

    Returns the parsed RawResponse, or None if the connection closed with
    no data.
    """
    response_bytes = _read_complete_response(sock)

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
        return _read_response(sock)


def send_invalid_chunk_size_delay(
    chunk_delay: float,
    host: str,
    port: int,
    path: str = "/",
    timeout: float = 5.0,
) -> RawResponse | None:
    """Send a chunked POST with a non-hex chunk size field (ZZZZ\\r\\n), waiting before
     sending the invalid chunk.

    Bypasses h11 validation by writing raw bytes after the headers.
    Returns the proxy's response, or None if the connection was closed.
    """
    conn = h11.Connection(our_role=h11.CLIENT)
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
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
        # Send one properly-framed chunk. h11 produces the chunk
        # length prefix and trailing CRLF.
        sock.sendall(conn.send(h11.Data(data=b"deadbeef")))

        time.sleep(chunk_delay)
        # Send invalid chunk size field directly (bypasses h11)
        sock.sendall(b"ZZZZ\r\nhello\r\n0\r\n\r\n")
        return _read_response(sock)


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
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        sock.sendall(raw)
        return _read_response(sock)


def send_and_read_response(
    host: str,
    port: int,
    path: str = "/",
    timeout: float = 5.0,
) -> RawResponse | None:
    """Send a GET request and return the raw response.

    Returns the full RawResponse (with raw chunked body bytes
    preserved), or None if the connection was closed without data.
    """
    conn = h11.Connection(our_role=h11.CLIENT)
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        sock.sendall(
            conn.send(
                h11.Request(
                    method="GET",
                    target=path,
                    headers=[("host", f"{host}:{port}")],
                )
            )
        )
        return _read_response(sock)


def parse_chunked_trailers(
    body: bytes,
) -> dict[str, list[str]]:
    """Extract trailer headers from raw chunked response body.

    The raw body from _read_chunked_body includes chunk framing
    and trailing headers. This function parses any trailer fields
    that appear after the zero-length terminating chunk.

    Returns a dict mapping lowercase header names to lists of
    values. Returns an empty dict if no trailers are found.
    """
    trailers: dict[str, list[str]] = {}
    # Look for the zero-length chunk: "0\r\n"
    # Trailers follow the zero-length chunk line.
    pos = 0
    while pos < len(body):
        crlf = body.find(b"\r\n", pos)
        if crlf == -1:
            break
        size_field = body[pos:crlf].split(b";")[0].strip()
        try:
            chunk_size = int(size_field, 16)
        except ValueError:
            break
        if chunk_size == 0:
            # Everything after "0\r\n" until "\r\n" is trailers
            trailer_start = crlf + 2
            trailer_section = body[trailer_start:]
            # Remove final \r\n if present
            if trailer_section.endswith(b"\r\n"):
                trailer_section = trailer_section[:-2]
            if not trailer_section:
                break
            for line in trailer_section.split(b"\r\n"):
                decoded = line.decode("latin-1")
                name, _, value = decoded.partition(":")
                name = name.strip().lower()
                value = value.strip()
                if name:
                    trailers.setdefault(name, []).append(value)
            break
        # Skip chunk data + trailing CRLF
        pos = crlf + 2 + chunk_size + 2
    return trailers


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
