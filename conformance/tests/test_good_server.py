"""Validate GoodServer in isolation (no proxy)."""

from __future__ import annotations

import queue
from collections.abc import Generator

import httpx
import pytest

from proxy_conformance.good_server import GoodServer


@pytest.fixture()
def server() -> Generator[GoodServer]:
    srv = GoodServer()
    srv.start()
    yield srv
    srv.stop()


@pytest.fixture()
def client() -> Generator[httpx.Client]:
    """httpx client with trust_env=False to avoid picking up sandbox proxy settings."""
    with httpx.Client(trust_env=False) as c:
        yield c


class TestEchoEndpoint:
    """GET, POST, HEAD all echo request details via /echo."""

    def test_get(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.get(
            f"{server.url}/echo/test-path",
            headers={"X-Custom": "hello"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["method"] == "GET"
        assert data["path"] == "/echo/test-path"
        assert "hello" in data["headers"]["x-custom"]

    def test_post_body(self, server: GoodServer, client: httpx.Client) -> None:
        import base64

        resp = client.post(
            f"{server.url}/echo/submit",
            content=b'{"key": "value"}',
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["method"] == "POST"
        assert base64.b64decode(data["body_base64"]) == b'{"key": "value"}'

    def test_query_string_preserved(
        self, server: GoodServer, client: httpx.Client
    ) -> None:
        resp = client.get(f"{server.url}/echo/search?q=test&page=2")
        data = resp.json()
        assert data["path"] == "/echo/search?q=test&page=2"

    def test_echo_bare_path(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.get(f"{server.url}/echo")
        assert resp.status_code == 200
        data = resp.json()
        assert data["path"] == "/echo"


class TestOutOfBand:
    """Out-of-band capture works for all methods including HEAD."""

    def test_head_no_body(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.head(f"{server.url}/echo/head-test")
        assert resp.status_code == 200
        assert resp.content == b""
        captured = server.last_request()
        assert captured.method == "HEAD"
        assert captured.path == "/echo/head-test"

    def test_get_captured(self, server: GoodServer, client: httpx.Client) -> None:
        client.get(
            f"{server.url}/echo/oob",
            headers={"X-Trace": "abc123"},
        )
        captured = server.last_request()
        assert captured.method == "GET"
        assert captured.path == "/echo/oob"
        assert captured.header_values("x-trace") == ["abc123"]

    def test_post_body_captured(self, server: GoodServer, client: httpx.Client) -> None:
        client.post(f"{server.url}/echo/data", content=b"raw bytes")
        captured = server.last_request()
        assert captured.body == b"raw bytes"

    def test_multiple_requests_queued(
        self, server: GoodServer, client: httpx.Client
    ) -> None:
        client.get(f"{server.url}/echo/first")
        client.get(f"{server.url}/echo/second")
        first = server.last_request()
        second = server.last_request()
        assert first.path == "/echo/first"
        assert second.path == "/echo/second"

    def test_empty_queue_times_out(self, server: GoodServer) -> None:
        with pytest.raises(queue.Empty):
            server.last_request(timeout=0.1)


class TestStatusEndpoint:
    """/status/{code} responds with the given HTTP status code."""

    def test_404_status(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.get(f"{server.url}/status/404")
        assert resp.status_code == 404
        assert resp.json() == {"status": 404}

    def test_503_status(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.get(f"{server.url}/status/503")
        assert resp.status_code == 503

    def test_200_status(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.get(f"{server.url}/status/200")
        assert resp.status_code == 200

    def test_status_with_path_suffix_captures(
        self, server: GoodServer, client: httpx.Client
    ) -> None:
        client.get(f"{server.url}/status/200/my-tag")
        captured = server.last_request()
        assert captured.path == "/status/200/my-tag"

    def test_status_captures_request(
        self, server: GoodServer, client: httpx.Client
    ) -> None:
        client.get(f"{server.url}/status/201")
        captured = server.last_request()
        assert captured.path == "/status/201"


class TestRedirectEndpoint:
    """/redirect/{code}?to={url} responds with the given redirect."""

    def test_redirect_302(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.get(
            f"{server.url}/redirect/302?to=/echo/new-location",
            follow_redirects=False,
        )
        assert resp.status_code == 302
        assert resp.headers["location"] == "/echo/new-location"

    def test_redirect_301(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.get(
            f"{server.url}/redirect/301?to=https://example.com",
            follow_redirects=False,
        )
        assert resp.status_code == 301
        assert resp.headers["location"] == "https://example.com"

    def test_redirect_captures_request(
        self, server: GoodServer, client: httpx.Client
    ) -> None:
        client.get(
            f"{server.url}/redirect/302?to=/echo/",
            follow_redirects=False,
        )
        captured = server.last_request()
        assert captured.path.startswith("/redirect/302")


class TestHeadersEndpoint:
    """/headers?Name=value responds with query params as response headers."""

    def test_single_header(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.get(f"{server.url}/headers?X-Custom=hello")
        assert resp.status_code == 200
        assert resp.headers["x-custom"] == "hello"

    def test_multiple_headers(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.get(f"{server.url}/headers?X-Foo=one&Cache-Control=no-cache")
        assert resp.status_code == 200
        assert resp.headers["x-foo"] == "one"
        assert resp.headers["cache-control"] == "no-cache"

    def test_headers_captures_request(
        self, server: GoodServer, client: httpx.Client
    ) -> None:
        client.get(f"{server.url}/headers?X-Test=1")
        captured = server.last_request()
        assert captured.path.startswith("/headers")


class TestBodyChunkedEndpoint:
    """/body/chunked?size={n} responds with a chunked body of n bytes."""

    def test_body_size(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.get(f"{server.url}/body/chunked?size=100")
        assert resp.status_code == 200
        assert len(resp.content) == 100

    def test_zero_size(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.get(f"{server.url}/body/chunked?size=0")
        assert resp.status_code == 200
        assert len(resp.content) == 0

    def test_captures_request(self, server: GoodServer, client: httpx.Client) -> None:
        client.get(f"{server.url}/body/chunked?size=10")
        captured = server.last_request()
        assert captured.path == "/body/chunked?size=10"


class TestBodyContentLengthEndpoint:
    """/body/content-length?size={n} responds with a Content-Length body."""

    def test_body_size(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.get(f"{server.url}/body/content-length?size=50")
        assert resp.status_code == 200
        assert len(resp.content) == 50
        assert int(resp.headers["content-length"]) == 50

    def test_zero_size(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.get(f"{server.url}/body/content-length?size=0")
        assert resp.status_code == 200
        assert len(resp.content) == 0

    def test_captures_request(self, server: GoodServer, client: httpx.Client) -> None:
        client.get(f"{server.url}/body/content-length?size=5")
        captured = server.last_request()
        assert captured.path == "/body/content-length?size=5"


class TestChunkedWithTrailersEndpoint:
    """/chunked-with-trailers?Name=value responds with chunked body and trailers."""

    def test_trailer_header_present(
        self, server: GoodServer, client: httpx.Client
    ) -> None:
        resp = client.get(f"{server.url}/chunked-with-trailers?X-Foo=bar")
        assert resp.status_code == 200
        assert "x-foo" in resp.headers.get("trailer", "").lower()

    def test_body_present(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.get(f"{server.url}/chunked-with-trailers?X-Foo=bar")
        assert resp.status_code == 200
        assert b"chunked body" in resp.content

    def test_captures_request(self, server: GoodServer, client: httpx.Client) -> None:
        client.get(f"{server.url}/chunked-with-trailers?X-Tag=test")
        captured = server.last_request()
        assert captured.path.startswith("/chunked-with-trailers")


class TestUnknownPath:
    """Unrecognised paths return 404."""

    def test_unknown_path(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.get(f"{server.url}/unknown-path")
        assert resp.status_code == 404

    def test_root_path(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.get(f"{server.url}/")
        assert resp.status_code == 404

    def test_bare_hello(self, server: GoodServer, client: httpx.Client) -> None:
        resp = client.get(f"{server.url}/hello")
        assert resp.status_code == 404
