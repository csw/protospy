"""Proxy conformance tests for gRPC proxying over HTTP/2 (§17).

Tests that the proxy correctly forwards gRPC traffic (HTTP/2 with h2c
to the upstream), preserving message framing, streaming, trailers,
and error semantics.

§17.1: Unary echo RPC through the proxy.
§17.2: Server streaming RPC.
§17.3: Bidirectional streaming RPC.
§17.4: gRPC error propagation via trailers.
§17.5: Large message spanning multiple HTTP/2 DATA frames.
§17.6: Deadline/timeout forwarding.
"""

from __future__ import annotations

import grpc
import pytest

from proxy_conformance.proto import echo_pb2, echo_pb2_grpc

from .proxies import ProxyUrls

pytestmark = [pytest.mark.xfail_for("protospy")]


def _stub(proxy: ProxyUrls) -> echo_pb2_grpc.EchoStub:
    """Create an Echo stub connected through the proxy."""
    channel = grpc.insecure_channel(f"{proxy.grpc_host}:{proxy.grpc_port}")
    return echo_pb2_grpc.EchoStub(channel)


def test_unary_echo(proxy: ProxyUrls) -> None:
    """Unary gRPC call proxied correctly (§17.1)."""
    stub = _stub(proxy)
    request = echo_pb2.EchoRequest(message="hello grpc")
    response = stub.UnaryEcho(request)
    assert response.message == "hello grpc"
    assert response.sequence == 0


def test_server_streaming(proxy: ProxyUrls) -> None:
    """Server-streaming RPC forwarded correctly (§17.2)."""
    stub = _stub(proxy)
    request = echo_pb2.StreamRequest(message="stream", count=10)
    responses = list(stub.ServerStream(request))
    assert len(responses) == 10
    for i, resp in enumerate(responses):
        assert resp.message == "stream"
        assert resp.sequence == i


def test_bidi_streaming(proxy: ProxyUrls) -> None:
    """Bidirectional streaming RPC forwarded correctly (§17.3)."""
    stub = _stub(proxy)
    messages = [f"msg-{i}" for i in range(5)]

    def request_iter():
        for msg in messages:
            yield echo_pb2.EchoRequest(message=msg)

    responses = list(stub.BidiStream(request_iter()))
    assert len(responses) == 5
    for i, resp in enumerate(responses):
        assert resp.message == messages[i]
        assert resp.sequence == i


def test_grpc_error_propagation(proxy: ProxyUrls) -> None:
    """gRPC error status in trailers forwarded correctly (§17.4)."""
    stub = _stub(proxy)
    request = echo_pb2.EchoRequest(message="__error__")
    try:
        stub.UnaryEcho(request)
        msg = "Expected RpcError"
        raise AssertionError(msg)
    except grpc.RpcError as e:
        assert e.code() == grpc.StatusCode.INVALID_ARGUMENT
        details = e.details()
        assert details is not None and "test error" in details


def test_large_message(proxy: ProxyUrls) -> None:
    """Large gRPC message (~1 MB) proxied without truncation (§17.5)."""
    stub = _stub(proxy)
    payload = bytes(range(256)) * 4096  # 1 MB
    request = echo_pb2.EchoRequest(message="large", payload=payload)
    response = stub.UnaryEcho(request)
    assert response.message == "large"
    assert response.payload == payload


def test_grpc_timeout(proxy: ProxyUrls) -> None:
    """gRPC deadline exceeded through proxy (§17.6)."""
    stub = _stub(proxy)
    request = echo_pb2.EchoRequest(message="__slow__")
    try:
        stub.UnaryEcho(request, timeout=0.5)
        msg = "Expected RpcError for deadline exceeded"
        raise AssertionError(msg)
    except grpc.RpcError as e:
        assert e.code() == grpc.StatusCode.DEADLINE_EXCEEDED
