"""GoodServer: a well-behaved aiohttp target server for proxy conformance testing.

Accepts any HTTP request, captures it for out-of-band retrieval,
and routes to endpoint-specific handlers based on the path:

- /echo and /echo/{anything} — echo request details as JSON
- /status/{code} and /status/{code}/{anything} — respond with the given status
- /redirect/{code}?to={url} — respond with redirect status and Location header
- /headers?Name=value — respond with 200, query params as response headers
- /body/chunked?size={n} — chunked body of n bytes
- /body/content-length?size={n} — Content-Length-framed body of n bytes
- /chunked-with-trailers?Trailer-Name=value — chunked response with trailers

Unknown paths return 404. All endpoints capture requests out-of-band.
"""

from __future__ import annotations

import asyncio
import base64
import queue
import signal
import threading
from dataclasses import dataclass, field
from typing import Annotated, cast

import typer
from aiohttp import web

from proxy_conformance.net import find_free_port
from proxy_conformance.request_logging import log_request


@dataclass
class CapturedRequest:
    """A request as observed by a target server."""

    method: str
    path: str
    headers: dict[str, list[str]]
    body: bytes

    def header_values(self, name: str) -> list[str]:
        """Get all values for a header name (case-insensitive)."""
        return self.headers.get(name.lower(), [])

    def header_joined(self, name: str) -> str | None:
        """Get a header's values joined with ', ' (case-insensitive)."""
        values = self.header_values(name)
        return ", ".join(values) if values else None


@dataclass
class GoodServer:
    """An HTTP server with endpoint-based routing that runs in a background thread.

    Usage:
        server = GoodServer()
        server.start()
        # ... make requests to server.url ...
        captured = server.last_request()
        server.stop()
    """

    host: str = "127.0.0.1"
    port: int = field(default_factory=find_free_port)
    log_requests: bool = False
    requests: queue.Queue[CapturedRequest] = field(
        default_factory=queue.Queue,
    )
    _thread: threading.Thread | None = field(default=None, repr=False)
    _loop: asyncio.AbstractEventLoop | None = field(default=None, repr=False)
    _runner: web.AppRunner | None = field(default=None, repr=False)

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}"

    def start(self) -> None:
        """Start the server in a background thread. Blocks until ready."""
        started = threading.Event()
        self._thread = threading.Thread(
            target=self._run,
            args=(started,),
            daemon=True,
        )
        self._thread.start()
        if not started.wait(timeout=5):
            raise RuntimeError("Good server failed to start within 5 seconds")

    def stop(self) -> None:
        """Stop the server and wait for the background thread to exit."""
        if self._loop and self._runner:
            # Run cleanup and cancel any lingering tasks before stopping the
            # loop.  runner.cleanup() alone leaves aiohttp-internal tasks
            # pending, which causes "Task was destroyed but it is pending!"
            # warnings at GC time.
            future = asyncio.run_coroutine_threadsafe(
                self._cleanup_all(),
                self._loop,
            )
            future.result(timeout=5)
        # Stop the event loop from the calling thread after cleanup is done.
        if self._loop:
            self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread:
            self._thread.join(timeout=5)

    async def _cleanup_all(self) -> None:
        if self._runner:
            await self._runner.cleanup()
        tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

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

    def _run(self, started: threading.Event) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self._start_app(started))
        self._loop.run_forever()

    async def _start_app(self, started: threading.Event) -> None:
        app = web.Application()
        r = app.router
        r.add_route("*", "/echo", self._handle_echo)
        r.add_route("*", r"/echo/{path_info:.*}", self._handle_echo)
        r.add_route("*", "/status/{code}", self._handle_status)
        r.add_route("*", r"/status/{code}/{path_info:.*}", self._handle_status)
        r.add_route("*", "/redirect/{code}", self._handle_redirect)
        r.add_route("*", "/headers", self._handle_headers)
        r.add_route("*", "/body/chunked", self._handle_body_chunked)
        r.add_route("*", "/body/content-length", self._handle_body_content_length)
        r.add_route("*", "/chunked-with-trailers", self._handle_chunked_with_trailers)
        r.add_route("*", r"/{path_info:.*}", self._handle_not_found)
        self._runner = web.AppRunner(app)
        await self._runner.setup()
        site = web.TCPSite(self._runner, self.host, self.port)
        await site.start()
        started.set()

    async def _shutdown(self) -> None:
        if self._runner:
            await self._runner.cleanup()

    async def _capture(self, request: web.Request) -> CapturedRequest:
        """Read the request body and enqueue it for out-of-band retrieval."""
        body = await request.read()

        headers: dict[str, list[str]] = {}
        for name, value in request.headers.items():
            headers.setdefault(name.lower(), []).append(value)

        captured = CapturedRequest(
            method=request.method,
            path=request.path_qs,
            headers=headers,
            body=body,
        )
        self.requests.put(captured)
        if self.log_requests:
            log_request(
                captured.method, captured.path, len(captured.body), label="good-server"
            )
        return captured

    async def _handle_echo(self, request: web.Request) -> web.Response:
        """Echo request details as JSON. For HEAD, return an empty 200."""
        captured = await self._capture(request)

        if request.method == "HEAD":
            return web.Response(status=200, content_type="application/json")

        echo_data = {
            "method": captured.method,
            "path": captured.path,
            "headers": captured.headers,
            "body_base64": base64.b64encode(captured.body).decode()
            if captured.body
            else None,
        }
        return web.json_response(echo_data)

    async def _handle_status(self, request: web.Request) -> web.Response:
        """Respond with the status code from the URL path."""
        await self._capture(request)
        code = int(request.match_info["code"])
        return web.json_response({"status": code}, status=code)

    async def _handle_redirect(self, request: web.Request) -> web.Response:
        """Respond with a redirect status and Location header."""
        await self._capture(request)
        code = int(request.match_info["code"])
        to = request.rel_url.query.get("to", "/")
        return web.Response(status=code, headers={"Location": to})

    async def _handle_headers(self, request: web.Request) -> web.Response:
        """Respond with 200 and query parameters as response headers."""
        await self._capture(request)
        headers = {k: v for k, v in request.rel_url.query.items()}
        return web.Response(status=200, headers=headers)

    async def _handle_body_chunked(self, request: web.Request) -> web.StreamResponse:
        """Respond with a chunked body of the requested size."""
        await self._capture(request)
        size = int(request.rel_url.query.get("size", "0"))
        resp = web.StreamResponse()
        resp.enable_chunked_encoding()
        await resp.prepare(request)
        await resp.write(b"x" * size)
        return resp

    async def _handle_body_content_length(self, request: web.Request) -> web.Response:
        """Respond with a Content-Length-framed body of the requested size."""
        await self._capture(request)
        size = int(request.rel_url.query.get("size", "0"))
        return web.Response(body=b"x" * size, content_type="application/octet-stream")

    async def _handle_chunked_with_trailers(
        self, request: web.Request
    ) -> web.StreamResponse:
        """Respond with a chunked body and HTTP trailers from query params.

        aiohttp does not support HTTP trailers natively. This handler writes
        the final chunk and trailer section directly via the asyncio transport.
        """
        await self._capture(request)
        trailers = list(request.rel_url.query.items())
        trailer_names = [k for k, _ in trailers]

        resp = web.StreamResponse(headers={"Trailer": ", ".join(trailer_names)})
        resp.enable_chunked_encoding()
        await resp.prepare(request)
        await resp.write(b"chunked body\n")

        # Write the final zero-length chunk with trailer fields directly, since
        # aiohttp's write_eof() would emit "0\r\n\r\n" with no trailers.
        trailer_block = b"".join(f"{k}: {v}\r\n".encode() for k, v in trailers)
        transport = cast(asyncio.WriteTransport, request.transport)
        transport.write(b"0\r\n" + trailer_block + b"\r\n")

        # Mark eof as sent so aiohttp does not write a second terminator.
        resp._eof_sent = True  # noqa: SLF001
        return resp

    async def _handle_not_found(self, request: web.Request) -> web.Response:
        """Return 404 for any unrecognised path."""
        return web.Response(status=404)


def main(
    port: Annotated[int, typer.Option("-p", help="Port to listen on.")] = 8514,
    log: Annotated[
        bool, typer.Option("-l", "--log", help="Log requests to stderr.")
    ] = False,
) -> None:
    server = GoodServer(port=port, log_requests=log)
    server.start()
    print(f"Good server listening on {server.url}", flush=True)
    print("Endpoints:", flush=True)
    for path in [
        "/echo",
        "/echo/{anything}",
        "/status/{code}",
        "/redirect/{code}?to={url}",
        "/headers?Name=value",
        "/body/chunked?size={n}",
        "/body/content-length?size={n}",
        "/chunked-with-trailers?Trailer-Name=value",
    ]:
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
