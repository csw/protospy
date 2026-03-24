"""Helpers for starting proxy subprocesses under test."""

from __future__ import annotations

import json
import socket
import subprocess
import time
import urllib.parse
from dataclasses import dataclass
from pathlib import Path

from proxy_conformance.net import find_free_port


@dataclass
class ProxyEntry:
    """A proxy frontend+backend pair: listen port and upstream target."""

    listen_port: int  # port the proxy binds to (exposed to test clients)
    upstream: str  # upstream target URL (http://host:port)


def _wait_for_port(
    port: int,
    host: str = "127.0.0.1",
    timeout: float = 5.0,
) -> None:
    """Block until a TCP connection to host:port succeeds."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.1):
                return
        except OSError:
            time.sleep(0.05)
    msg = f"Port {port} not available after {timeout}s"
    raise TimeoutError(msg)


def _parse_duration_ns(duration: str) -> int:
    """Convert a Go-style duration string (e.g. '30s', '1m') to nanoseconds."""
    multipliers = {
        "ns": 1,
        "us": 1_000,
        "ms": 1_000_000,
        "s": 1_000_000_000,
        "m": 60_000_000_000,
        "h": 3_600_000_000_000,
    }
    for suffix, mult in multipliers.items():
        if duration.endswith(suffix):
            return int(duration[: -len(suffix)]) * mult
    raise ValueError(f"Unknown duration: {duration!r}")


def _dial(url: str) -> str:
    """Extract host:port from a URL for use as a Caddy dial address."""
    return urllib.parse.urlparse(url).netloc


def _wire_server_config(
    entry: ProxyEntry,
    transport: dict[str, object],
    idle_timeout: str,
    read_timeout: str,
) -> dict[str, object]:
    """Build the Caddy JSON server block for the wire upstream."""
    server: dict[str, object] = {
        "listen": [f":{entry.listen_port}"],
        "routes": [
            {
                "handle": [
                    {
                        "handler": "reverse_proxy",
                        "transport": transport,
                        "upstreams": [{"dial": _dial(entry.upstream)}],
                    }
                ]
            }
        ],
    }
    if idle_timeout:
        server["idle_timeout"] = _parse_duration_ns(idle_timeout)
    if read_timeout:
        server["read_timeout"] = _parse_duration_ns(read_timeout)
    return server


def start_caddy(
    good: ProxyEntry,
    wire: ProxyEntry,
    dead: ProxyEntry,
    tmp_dir: Path,
    *,
    grpc: ProxyEntry | None = None,
    h2c: ProxyEntry | None = None,
    dial_timeout: str = "30s",
    response_header_timeout: str = "",
    idle_timeout: str = "",
    read_timeout: str = "",
) -> subprocess.Popen[bytes]:
    """Start a Caddy reverse proxy subprocess configured via JSON API.

    Returns the Popen handle. The caller is responsible for terminating it.
    """
    transport: dict[str, object] = {
        "protocol": "http",
        "dial_timeout": _parse_duration_ns(dial_timeout),
    }
    if response_header_timeout:
        transport["response_header_timeout"] = _parse_duration_ns(
            response_header_timeout
        )

    servers: dict[str, object] = {
        "good": {
            "listen": [f":{good.listen_port}"],
            "routes": [
                {
                    "handle": [
                        {
                            "handler": "reverse_proxy",
                            # Trust the loopback so that an existing
                            # X-Forwarded-For from the test client is
                            # preserved and appended to, not replaced.
                            "trusted_proxies": ["127.0.0.1/32"],
                            "upstreams": [{"dial": _dial(good.upstream)}],
                        }
                    ]
                }
            ],
        },
        "wire": _wire_server_config(wire, transport, idle_timeout, read_timeout),
        "dead": {
            "listen": [f":{dead.listen_port}"],
            "routes": [
                {
                    "handle": [
                        {
                            "handler": "reverse_proxy",
                            "upstreams": [{"dial": _dial(dead.upstream)}],
                        }
                    ]
                }
            ],
        },
    }
    if grpc is not None:
        servers["grpc"] = {
            "listen": [f":{grpc.listen_port}"],
            "routes": [
                {
                    "handle": [
                        {
                            "handler": "reverse_proxy",
                            "transport": {
                                "protocol": "http",
                                "versions": ["h2c"],
                            },
                            "upstreams": [{"dial": _dial(grpc.upstream)}],
                        }
                    ]
                }
            ],
        }
    if h2c is not None:
        servers["h2c"] = {
            "listen": [f":{h2c.listen_port}"],
            "routes": [
                {
                    "handle": [
                        {
                            "handler": "reverse_proxy",
                            "transport": {
                                "protocol": "http",
                                "versions": ["h2c"],
                            },
                            "upstreams": [{"dial": _dial(h2c.upstream)}],
                        }
                    ]
                }
            ],
        }

    config: dict[str, object] = {
        "admin": {"disabled": True},
        "apps": {"http": {"servers": servers}},
    }

    config_file = tmp_dir / "caddy.json"
    config_file.write_text(json.dumps(config))

    proc = subprocess.Popen(
        ["caddy", "run", "--config", str(config_file)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    ports = [good.listen_port, wire.listen_port, dead.listen_port]
    if grpc is not None:
        ports.append(grpc.listen_port)
    if h2c is not None:
        ports.append(h2c.listen_port)
    for port in ports:
        try:
            _wait_for_port(port)
        except TimeoutError:
            proc.terminate()
            proc.wait(timeout=5)
            stderr = proc.stderr.read() if proc.stderr else b""
            msg = f"Caddy failed to start: {stderr.decode(errors='replace')}"
            raise RuntimeError(msg) from None

    return proc


def start_haproxy(
    good: ProxyEntry,
    wire: ProxyEntry,
    dead: ProxyEntry,
    tmp_dir: Path,
    *,
    grpc: ProxyEntry | None = None,
    h2c: ProxyEntry | None = None,
    connect_timeout: str = "5s",
    server_timeout: str = "30s",
    client_timeout: str = "30s",
) -> subprocess.Popen[bytes]:
    """Start an HAProxy reverse proxy subprocess.

    Returns the Popen handle. The caller is responsible for terminating it.
    """
    config_content = f"""\
global
    maxconn 256

defaults
    mode http
    timeout connect {connect_timeout}
    timeout client {client_timeout}
    timeout server {server_timeout}
    option forwardfor

frontend good_frontend
    bind :{good.listen_port}
    http-request add-header Via "1.1 haproxy"
    http-response add-header Via "1.1 haproxy"
    default_backend good_backend

backend good_backend
    server upstream {_dial(good.upstream)}

frontend wire_frontend
    bind :{wire.listen_port}
    http-request add-header Via "1.1 haproxy"
    http-response add-header Via "1.1 haproxy"
    default_backend wire_backend

backend wire_backend
    server upstream {_dial(wire.upstream)}

frontend dead_frontend
    bind :{dead.listen_port}
    http-request add-header Via "1.1 haproxy"
    http-response add-header Via "1.1 haproxy"
    default_backend dead_backend

backend dead_backend
    server upstream {_dial(dead.upstream)}
"""
    if grpc is not None:
        config_content += f"""
frontend grpc_frontend
    bind :{grpc.listen_port} proto h2
    default_backend grpc_backend

backend grpc_backend
    server upstream {_dial(grpc.upstream)} proto h2
"""
    if h2c is not None:
        config_content += f"""
frontend h2c_frontend
    bind :{h2c.listen_port}
    http-request add-header Via "1.1 haproxy"
    http-response add-header Via "1.1 haproxy"
    default_backend h2c_backend

backend h2c_backend
    server upstream {_dial(h2c.upstream)} proto h2
"""

    config_file = tmp_dir / "haproxy.cfg"
    config_file.write_text(config_content)

    proc = subprocess.Popen(
        ["haproxy", "-f", str(config_file)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    ports = [good.listen_port, wire.listen_port, dead.listen_port]
    if grpc is not None:
        ports.append(grpc.listen_port)
    if h2c is not None:
        ports.append(h2c.listen_port)
    for port in ports:
        try:
            _wait_for_port(port)
        except TimeoutError:
            proc.terminate()
            proc.wait(timeout=5)
            stderr = proc.stderr.read() if proc.stderr else b""
            msg = f"HAProxy failed to start: {stderr.decode(errors='replace')}"
            raise RuntimeError(msg) from None

    return proc


# ---------------------------------------------------------------------------
# Test URL helpers
# ---------------------------------------------------------------------------


def tagged_url(url: str, test_id: str) -> str:
    """Append _test=<test_id> query parameter to a URL or path."""
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}_test={test_id}"


# ---------------------------------------------------------------------------
# Proxy coordinate types and startup helpers
# ---------------------------------------------------------------------------

ALL_PROXIES = ["caddy", "haproxy"]


@dataclass
class ProxyUrls:
    """Client-facing URLs and addresses for proxy channels under test."""

    good_url: str
    wire_url: str
    good_host: str
    good_port: int
    wire_host: str
    wire_port: int
    dead_url: str
    dead_host: str
    dead_port: int
    grpc_host: str = ""
    grpc_port: int = 0
    h2c_url: str = ""
    h2c_host: str = ""
    h2c_port: int = 0


def make_proxy_urls(
    good: ProxyEntry,
    wire: ProxyEntry,
    dead: ProxyEntry,
    grpc: ProxyEntry | None = None,
    h2c: ProxyEntry | None = None,
) -> ProxyUrls:
    """Build a ProxyUrls for a locally-started proxy on loopback."""
    urls = ProxyUrls(
        good_url=f"http://127.0.0.1:{good.listen_port}",
        wire_url=f"http://127.0.0.1:{wire.listen_port}",
        good_host="127.0.0.1",
        good_port=good.listen_port,
        wire_host="127.0.0.1",
        wire_port=wire.listen_port,
        dead_url=f"http://127.0.0.1:{dead.listen_port}",
        dead_host="127.0.0.1",
        dead_port=dead.listen_port,
    )
    if grpc is not None:
        urls.grpc_host = "127.0.0.1"
        urls.grpc_port = grpc.listen_port
    if h2c is not None:
        urls.h2c_url = f"http://127.0.0.1:{h2c.listen_port}"
        urls.h2c_host = "127.0.0.1"
        urls.h2c_port = h2c.listen_port
    return urls


_START_RETRIES = 3


def start_proxy(
    proxy_type: str,
    good_upstream: str,
    wire_upstream: str,
    tmp_dir: Path,
    grpc_upstream: str = "",
    h2c_upstream: str = "",
) -> tuple[subprocess.Popen[bytes], ProxyUrls]:
    """Allocate ports, start proxy with default timeouts, return (proc, urls).

    Retries up to ``_START_RETRIES`` times on port conflicts (the
    TOCTOU gap between ``find_free_port`` and ``bind`` is inherent
    when many workers start proxies concurrently).

    For non-default timeouts call start_caddy / start_haproxy directly.
    Raises ValueError for unknown proxy types.
    """
    if proxy_type not in ALL_PROXIES:
        supported = ", ".join(ALL_PROXIES)
        msg = (
            f"Unknown proxy type: {proxy_type!r}. "
            f"Supported: {supported}. "
            "To add a new proxy, extend ALL_PROXIES and the dispatch "
            "in start_proxy() in proxies.py."
        )
        raise ValueError(msg)

    last_exc: RuntimeError | None = None
    for attempt in range(_START_RETRIES):
        good = ProxyEntry(listen_port=find_free_port(), upstream=good_upstream)
        wire = ProxyEntry(listen_port=find_free_port(), upstream=wire_upstream)
        dead = ProxyEntry(
            listen_port=find_free_port(),
            upstream=f"http://127.0.0.1:{find_free_port()}",
        )
        grpc_entry = (
            ProxyEntry(
                listen_port=find_free_port(),
                upstream=grpc_upstream,
            )
            if grpc_upstream
            else None
        )
        h2c_entry = (
            ProxyEntry(
                listen_port=find_free_port(),
                upstream=h2c_upstream,
            )
            if h2c_upstream
            else None
        )
        try:
            if proxy_type == "caddy":
                proc = start_caddy(
                    good,
                    wire,
                    dead,
                    tmp_dir=tmp_dir,
                    grpc=grpc_entry,
                    h2c=h2c_entry,
                )
            else:
                proc = start_haproxy(
                    good,
                    wire,
                    dead,
                    tmp_dir=tmp_dir,
                    grpc=grpc_entry,
                    h2c=h2c_entry,
                )
            return proc, make_proxy_urls(
                good,
                wire,
                dead,
                grpc=grpc_entry,
                h2c=h2c_entry,
            )
        except RuntimeError as exc:
            last_exc = exc
            if attempt < _START_RETRIES - 1:
                # Re-create tmp subdir for the next attempt so config
                # file paths don't collide.
                tmp_dir = tmp_dir.parent / f"{tmp_dir.name}_r{attempt}"
                tmp_dir.mkdir(exist_ok=True)

    assert last_exc is not None
    raise last_exc
