"""GrpcServer: a gRPC echo server for proxy conformance testing.

Provides a simple Echo service over h2c (cleartext HTTP/2) for testing
gRPC proxying through Caddy and HAProxy.

Service methods:
- UnaryEcho — echo request message/payload back
- ServerStream — yield count responses with incrementing sequence
- BidiStream — echo each incoming message as a response
"""

from __future__ import annotations

import signal
import socket
import time
from collections.abc import Iterator
from concurrent import futures
from dataclasses import dataclass, field
from typing import Annotated

import grpc
import typer

from proxy_conformance.net import find_free_port
from proxy_conformance.proto import echo_pb2, echo_pb2_grpc


class EchoServicer(echo_pb2_grpc.EchoServicer):
    """Implementation of the Echo gRPC service."""

    def UnaryEcho(self, request, context):  # type: ignore[override]
        if request.message == "__error__":
            context.abort(
                grpc.StatusCode.INVALID_ARGUMENT,
                "test error",
            )
        if request.message == "__slow__":
            time.sleep(3)
        return echo_pb2.EchoResponse(
            message=request.message,
            payload=request.payload,
            sequence=0,
        )

    def ServerStream(  # type: ignore[override]
        self, request, context
    ) -> Iterator[echo_pb2.EchoResponse]:
        for i in range(request.count):
            yield echo_pb2.EchoResponse(
                message=request.message,
                sequence=i,
            )

    def BidiStream(  # type: ignore[override]
        self, request_iterator, context
    ) -> Iterator[echo_pb2.EchoResponse]:
        for i, request in enumerate(request_iterator):
            yield echo_pb2.EchoResponse(
                message=request.message,
                payload=request.payload,
                sequence=i,
            )


@dataclass
class GrpcServer:
    host: str = "127.0.0.1"
    port: int = field(default_factory=find_free_port)
    _server: grpc.Server | None = field(default=None, repr=False)

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}"

    @property
    def target(self) -> str:
        return f"{self.host}:{self.port}"

    def start(self) -> None:
        self._server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
        echo_pb2_grpc.add_EchoServicer_to_server(EchoServicer(), self._server)
        self._server.add_insecure_port(f"{self.host}:{self.port}")
        self._server.start()
        self._wait_ready()

    def _wait_ready(self, timeout: float = 5.0) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                with socket.create_connection((self.host, self.port), timeout=0.1):
                    return
            except OSError:
                time.sleep(0.05)
        msg = f"gRPC server not ready on port {self.port} after {timeout}s"
        raise RuntimeError(msg)

    def stop(self) -> None:
        if self._server:
            self._server.stop(grace=5)
            self._server.wait_for_termination(timeout=5)


def main(
    port: Annotated[int, typer.Option("-p", help="Port to listen on.")] = 8515,
) -> None:
    server = GrpcServer(port=port)
    server.start()
    print(f"gRPC server listening on {server.target}")
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
