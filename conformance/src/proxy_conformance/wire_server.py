"""WireServer: a programmable h11 target server for proxy conformance testing.

Runs a raw TCP listener backed by h11 for request parsing. Each
registered path is served by a handler: a callable that receives the
parsed request, the raw body, and the socket, and is responsible for
writing the response (or deliberately misbehaving).

Unlike GoodServer, WireServer uses a static path router — handlers
are registered at startup, making the server equally useful for
automated tests and for ad hoc debugging (start it, hit known URLs).
"""

from __future__ import annotations

import queue
import signal
import socket
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Annotated

import h11
import typer

from proxy_conformance.good_server import CapturedRequest
from proxy_conformance.net import find_free_port
from proxy_conformance.request_logging import log_request

Handler = Callable[[h11.Request, bytes, socket.socket, h11.Connection], None]


# ---------------------------------------------------------------------------
# Handler helpers
# ---------------------------------------------------------------------------


def truncated_body(
    status: int = 200,
    promised_length: int = 1000,
    actual_bytes: bytes = b"X" * 500,
    extra_headers: list[tuple[str, str]] | None = None,
) -> Handler:
    """Return a handler that promises more body bytes than it sends.

    Sends response headers with Content-Length: promised_length, writes
    only actual_bytes, then returns (causing the connection to close).
    A well-behaved proxy should detect the premature close and return 502.
    """

    def handler(
        _request: h11.Request,
        _body: bytes,
        conn: socket.socket,
        _h11_conn: h11.Connection,
    ) -> None:
        headers = [("content-length", str(promised_length))]
        if extra_headers:
            headers.extend(extra_headers)
        header_block = "".join(f"{k}: {v}\r\n" for k, v in headers)
        conn.sendall(f"HTTP/1.1 {status} OK\r\n{header_block}\r\n".encode())
        conn.sendall(actual_bytes)
        # Return without sending promised_length bytes — connection drops mid-body.

    return handler


def malformed_chunks(
    status: int = 200,
    chunks: list[bytes] | None = None,
    extra_headers: list[tuple[str, str]] | None = None,
) -> Handler:
    """Return a handler that sends raw (potentially invalid) chunked framing.

    Each item in chunks is written verbatim to the socket. Tests can
    include valid chunks, invalid chunk-size fields, missing CRLFs, or
    omit the terminal zero-length chunk entirely.
    """

    def handler(
        _request: h11.Request,
        _body: bytes,
        conn: socket.socket,
        _h11_conn: h11.Connection,
    ) -> None:
        headers = [("transfer-encoding", "chunked")]
        if extra_headers:
            headers.extend(extra_headers)
        header_block = "".join(f"{k}: {v}\r\n" for k, v in headers)
        conn.sendall(f"HTTP/1.1 {status} OK\r\n{header_block}\r\n".encode())
        for chunk in chunks or []:
            conn.sendall(chunk)
        # No terminal chunk — connection closes with framing incomplete.

    return handler


def echo_handler() -> Handler:
    """Return a handler that sends a minimal 200 OK text response.

    Used as the default for standalone operation and for routes that
    don't need misbehavior.
    """

    def handler(
        _request: h11.Request,
        _body: bytes,
        conn: socket.socket,
        _h11_conn: h11.Connection,
    ) -> None:
        response_body = b"OK\n"
        headers = [
            ("content-length", str(len(response_body))),
            ("content-type", "text/plain"),
        ]
        header_block = "".join(f"{k}: {v}\r\n" for k, v in headers)
        conn.sendall(f"HTTP/1.1 200 OK\r\n{header_block}\r\n".encode())
        conn.sendall(response_body)

    return handler


def continue_and_echo() -> Handler:
    """100-continue handler: send 100, read body, echo in 200.

    For use with requests carrying Expect: 100-continue. Sends a
    100 Continue informational response via h11, reads the request
    body through h11's state machine, then echoes the body back in
    a 200 response.

    Uses h11 for all protocol interactions (not raw socket writes)
    because the state machine must stay in sync throughout the
    multi-phase exchange.
    """

    def handler(
        _request: h11.Request,
        body: bytes,
        conn: socket.socket,
        h11_conn: h11.Connection,
    ) -> None:
        # Send 100 Continue — unblocks h11's read side
        conn.sendall(
            h11_conn.send(h11.InformationalResponse(status_code=100, headers=[]))
        )

        # Read body through h11
        while True:
            event = h11_conn.next_event()
            if event is h11.NEED_DATA:
                data = conn.recv(65536)
                if not data:
                    return
                h11_conn.receive_data(data)
            elif isinstance(event, h11.Data):
                body += event.data
            elif isinstance(event, h11.EndOfMessage):
                break

        # Send final response via h11
        conn.sendall(
            h11_conn.send(
                h11.Response(
                    status_code=200,
                    headers=[
                        ("content-length", str(len(body))),
                        ("content-type", "application/octet-stream"),
                    ],
                )
            )
        )
        conn.sendall(h11_conn.send(h11.Data(data=body)))
        conn.sendall(h11_conn.send(h11.EndOfMessage()))

    return handler


def ignore_and_respond() -> Handler:
    """100-continue handler: ignore Expect, send final response directly.

    For use with requests carrying Expect: 100-continue. Skips the 100
    Continue and sends a 200 OK immediately without reading the request
    body. Models an upstream that doesn't support Expect or chooses to
    ignore it.
    """

    def handler(
        _request: h11.Request,
        _body: bytes,
        conn: socket.socket,
        h11_conn: h11.Connection,
    ) -> None:
        response_body = b"OK\n"
        conn.sendall(
            h11_conn.send(
                h11.Response(
                    status_code=200,
                    headers=[
                        ("content-length", str(len(response_body))),
                        ("content-type", "text/plain"),
                    ],
                )
            )
        )
        conn.sendall(h11_conn.send(h11.Data(data=response_body)))
        conn.sendall(h11_conn.send(h11.EndOfMessage()))

    return handler


def reject_expect() -> Handler:
    """100-continue handler: reject with 417 Expectation Failed.

    For use with requests carrying Expect: 100-continue. Sends 417
    immediately without reading the body or sending 100, signalling
    that this server does not honour the Expect header.
    """

    def handler(
        _request: h11.Request,
        _body: bytes,
        conn: socket.socket,
        h11_conn: h11.Connection,
    ) -> None:
        conn.sendall(
            h11_conn.send(
                h11.Response(
                    status_code=417,
                    headers=[("content-length", "0")],
                )
            )
        )
        conn.sendall(h11_conn.send(h11.EndOfMessage()))

    return handler


def delayed_100(_delay_seconds: float) -> Handler:
    """Stub: delayed 100-continue response handler.

    Full implementation requires a two-phase design: the handler must
    act before the request body is sent, which means intercepting the
    h11 PAUSED state in the accept loop rather than being called after
    the full request is read. Deferred for a future iteration.
    """
    msg = "delayed_100 is not yet implemented"
    raise NotImplementedError(msg)


# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------


@dataclass
class WireServer:
    """A programmable HTTP server for proxy edge-case testing.

    Usage:
        server = WireServer()
        server.add_route("/truncated", truncated_body(...))
        server.start()
        # ... make requests through the proxy to server.url ...
        captured = server.last_request()
        server.stop()
    """

    host: str = "127.0.0.1"
    port: int = field(default_factory=find_free_port)
    log_requests: bool = False
    requests: queue.Queue[CapturedRequest] = field(default_factory=queue.Queue)
    _routes: dict[str, Handler] = field(default_factory=dict, repr=False)
    _server_sock: socket.socket | None = field(default=None, repr=False)
    _thread: threading.Thread | None = field(default=None, repr=False)
    _stopping: bool = field(default=False, repr=False)
    _handler_exception: BaseException | None = field(default=None, repr=False)

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}"

    def add_route(self, path: str, handler: Handler) -> None:
        """Register a handler for an exact request path."""
        self._routes[path] = handler

    def start(self) -> None:
        """Start the server in a background thread. Blocks until ready."""
        started = threading.Event()
        self._thread = threading.Thread(target=self._run, args=(started,), daemon=True)
        self._thread.start()
        if not started.wait(timeout=5):
            raise RuntimeError("Wire server failed to start within 5 seconds")

    def stop(self) -> None:
        """Stop the accept loop and wait for the background thread to exit."""
        self._stopping = True
        if self._server_sock:
            try:
                self._server_sock.close()
            except OSError:
                pass
        if self._thread:
            self._thread.join(timeout=5)

    def last_request(self, timeout: float = 2.0) -> CapturedRequest:
        """Retrieve the next captured request. Blocks until available.

        Raises queue.Empty if no request arrives within the timeout.
        """
        return self.requests.get(timeout=timeout)

    def clear(self) -> None:
        """Drain any uncollected requests from the queue."""
        while True:
            try:
                self.requests.get_nowait()
            except queue.Empty:
                break

    def raise_if_handler_failed(self) -> None:
        """Re-raise any exception stored by the most recent handler, if any."""
        if self._handler_exception is not None:
            raise self._handler_exception

    def _run(self, started: threading.Event) -> None:
        self._server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._server_sock.bind((self.host, self.port))
        self._server_sock.listen(5)
        self._server_sock.settimeout(0.5)
        started.set()
        while not self._stopping:
            try:
                conn, _ = self._server_sock.accept()
            except TimeoutError:
                continue
            except OSError:
                break  # server socket closed by stop()
            try:
                self._handle_connection(conn)
            finally:
                conn.close()

    def _handle_connection(self, conn: socket.socket) -> None:
        h11_conn = h11.Connection(our_role=h11.SERVER)
        request: h11.Request | None = None
        body = b""

        while True:
            event = h11_conn.next_event()
            if event is h11.NEED_DATA:
                data = conn.recv(65536)
                if not data:
                    return
                h11_conn.receive_data(data)
            elif isinstance(event, h11.Request):
                request = event
                # If the client sent Expect: 100-continue, stop here.
                # h11 returns NEED_DATA (not PAUSED) in this state, so
                # waiting for more data would deadlock: the client won't
                # send the body until it receives a 1xx response.
                if any(
                    n.lower() == b"expect" and b"100-continue" in v.lower()
                    for n, v in request.headers
                ):
                    break
            elif isinstance(event, h11.Data):
                body += event.data
            elif isinstance(event, h11.EndOfMessage):
                break
            elif event is h11.PAUSED:
                # e.g. Expect: 100-continue — stop reading, let handler decide.
                break

        if request is None:
            return

        target = request.target.decode()
        route_path = target.split("?", 1)[0]
        handler = self._routes.get(route_path)

        if handler is None:
            # Unknown path: send 404 via h11.
            conn.sendall(
                h11_conn.send(
                    h11.Response(
                        status_code=404,
                        headers=[("content-length", "0")],
                    )
                )
            )
            conn.sendall(h11_conn.send(h11.EndOfMessage()))
            return

        headers: dict[str, list[str]] = {}
        for name, value in request.headers:
            headers.setdefault(name.decode().lower(), []).append(value.decode())

        captured = CapturedRequest(
            method=request.method.decode(),
            path=target,
            headers=headers,
            body=body,
        )
        self.requests.put(captured)
        if self.log_requests:
            log_request(
                captured.method, captured.path, len(captured.body), label="wire-server"
            )

        try:
            handler(request, body, conn, h11_conn)
        except Exception as exc:
            self._handler_exception = exc


# ---------------------------------------------------------------------------
# Standalone CLI
# ---------------------------------------------------------------------------


def main(
    port: Annotated[int, typer.Option("-p", help="Port to listen on.")] = 8515,
    log: Annotated[
        bool, typer.Option("-l", "--log", help="Log requests to stderr.")
    ] = False,
) -> None:
    server = WireServer(port=port, log_requests=log)
    server.add_route(
        "/truncated",
        truncated_body(promised_length=1000, actual_bytes=b"X" * 500),
    )
    server.add_route(
        "/malformed-chunks",
        malformed_chunks(chunks=[b"ZZZZ\r\nhello\r\n"]),
    )
    server.add_route("/", echo_handler())
    server.start()
    print(f"Wire server listening on {server.url}", flush=True)
    print("Routes:", flush=True)
    for path in server._routes:
        print(f"  {path}", flush=True)

    signal.signal(signal.SIGINT, signal.SIG_DFL)
    signal.signal(signal.SIGTERM, signal.SIG_DFL)

    try:
        signal.pause()
    except KeyboardInterrupt:
        pass

    print("\nShutting down…", flush=True)
    server.stop()


def _cli() -> None:
    typer.run(main)


if __name__ == "__main__":
    _cli()
