"""H2cServer: a cleartext HTTP/2 echo server for proxy conformance testing.

Accepts h2c (cleartext HTTP/2) connections, reads each request including
pseudo-headers, and echoes them back as JSON so tests can verify how the
proxy translates HTTP/1.1 requests into HTTP/2 when forwarding upstream.

Response body format::

    {
        "pseudo_headers": {":method": "POST", ":path": "/foo", ...},
        "headers": {"content-type": "application/json", ...},
        "body_length": 1024
    }
"""

from __future__ import annotations

import json
import queue
import signal
import socket
import threading
import time
from dataclasses import dataclass, field
from typing import Annotated

import h2.config
import h2.connection
import h2.events
import typer

from proxy_conformance.net import find_free_port


@dataclass
class CapturedH2Request:
    """A request captured by H2cServer, with pseudo-headers separated out."""

    pseudo_headers: dict[str, str]
    headers: dict[str, str]
    body_length: int


@dataclass
class H2cServer:
    """Cleartext HTTP/2 echo server for proxy conformance testing.

    Accepts h2c connections, captures each request, and echoes it back as
    JSON.  The captured requests are available via ``last_request()`` so
    tests can assert on pseudo-headers and regular headers.
    """

    host: str = "127.0.0.1"
    port: int = field(default_factory=find_free_port)
    _server_socket: socket.socket | None = field(default=None, repr=False)
    _thread: threading.Thread | None = field(default=None, repr=False)
    _stop_event: threading.Event = field(default_factory=threading.Event, repr=False)
    _captured: queue.Queue[CapturedH2Request] = field(
        default_factory=queue.Queue, repr=False
    )

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}"

    def start(self) -> None:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((self.host, self.port))
        sock.listen(16)
        sock.settimeout(0.5)
        self._server_socket = sock
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._accept_loop, daemon=True)
        self._thread.start()
        self._wait_ready()

    def _wait_ready(self, timeout: float = 5.0) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                with socket.create_connection((self.host, self.port), timeout=0.1):
                    return
            except OSError:
                time.sleep(0.05)
        msg = f"H2cServer not ready on port {self.port} after {timeout}s"
        raise RuntimeError(msg)

    def stop(self) -> None:
        self._stop_event.set()
        if self._server_socket:
            try:
                self._server_socket.close()
            except OSError:
                pass
        if self._thread:
            self._thread.join(timeout=5)

    def last_request(self, timeout: float = 2.0) -> CapturedH2Request:
        """Block until a request is captured and return it."""
        try:
            return self._captured.get(timeout=timeout)
        except queue.Empty:
            msg = f"No H2 request captured within {timeout}s"
            raise TimeoutError(msg) from None

    def clear(self) -> None:
        """Drain all captured requests."""
        while not self._captured.empty():
            try:
                self._captured.get_nowait()
            except queue.Empty:
                break

    # ------------------------------------------------------------------
    # Internal

    def _accept_loop(self) -> None:
        assert self._server_socket is not None
        while not self._stop_event.is_set():
            try:
                conn_sock, _ = self._server_socket.accept()
            except TimeoutError:
                continue  # poll timeout — check stop_event and retry
            except OSError:
                break  # socket closed or fatal error
            t = threading.Thread(
                target=self._handle_connection,
                args=(conn_sock,),
                daemon=True,
            )
            t.start()

    def _handle_connection(self, sock: socket.socket) -> None:
        config = h2.config.H2Configuration(client_side=False)
        conn = h2.connection.H2Connection(config=config)
        conn.initiate_connection()
        sock.sendall(conn.data_to_send(65535))

        # Per-stream state: stream_id → (headers list, body bytes)
        stream_headers: dict[int, list[tuple[str, str]]] = {}
        stream_body: dict[int, bytes] = {}

        try:
            while not self._stop_event.is_set():
                try:
                    data = sock.recv(65535)
                except OSError:
                    break
                if not data:
                    break

                events = conn.receive_data(data)
                for event in events:
                    if isinstance(event, h2.events.RequestReceived):
                        stream_headers[event.stream_id] = [
                            (
                                n.decode() if isinstance(n, bytes) else n,
                                v.decode() if isinstance(v, bytes) else v,
                            )
                            for n, v in event.headers
                        ]
                        stream_body[event.stream_id] = b""

                    elif isinstance(event, h2.events.DataReceived):
                        stream_body[event.stream_id] += event.data
                        conn.acknowledge_received_data(
                            event.flow_controlled_length, event.stream_id
                        )

                    elif isinstance(event, h2.events.StreamEnded):
                        sid = event.stream_id
                        self._send_response(
                            conn,
                            sid,
                            stream_headers.pop(sid, []),
                            stream_body.pop(sid, b""),
                        )

                    elif isinstance(event, h2.events.ConnectionTerminated):
                        return

                to_send = conn.data_to_send(65535)
                if to_send:
                    sock.sendall(to_send)

        finally:
            try:
                sock.close()
            except OSError:
                pass

    def _send_response(
        self,
        conn: h2.connection.H2Connection,
        stream_id: int,
        raw_headers: list[tuple[str, str]],
        body: bytes,
    ) -> None:
        pseudo: dict[str, str] = {}
        regular: dict[str, str] = {}
        for name, value in raw_headers:
            if name.startswith(":"):
                pseudo[name] = value
            else:
                regular[name] = value

        captured = CapturedH2Request(
            pseudo_headers=pseudo,
            headers=regular,
            body_length=len(body),
        )
        self._captured.put(captured)

        response_body = json.dumps(
            {
                "pseudo_headers": pseudo,
                "headers": regular,
                "body_length": len(body),
            }
        ).encode()

        conn.send_headers(
            stream_id,
            [
                (":status", "200"),
                ("content-type", "application/json"),
                ("content-length", str(len(response_body))),
            ],
        )
        conn.send_data(stream_id, response_body, end_stream=True)


# ---------------------------------------------------------------------------
# Standalone CLI
# ---------------------------------------------------------------------------


def main(
    port: Annotated[int, typer.Option("-p", help="Port to listen on.")] = 8516,
) -> None:
    server = H2cServer(port=port)
    server.start()
    print(f"H2c echo server listening on {server.host}:{server.port}")
    signal.signal(signal.SIGINT, signal.SIG_DFL)
    signal.signal(signal.SIGTERM, signal.SIG_DFL)
    try:
        signal.pause()
    except KeyboardInterrupt:
        pass
    print("\nShutting down…")
    server.stop()


def _cli() -> None:
    typer.run(main)


if __name__ == "__main__":
    _cli()
