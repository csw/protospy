"""Helpers for starting proxy subprocesses under test."""

from __future__ import annotations

import json
import socket
import subprocess
import time
import urllib.parse
from dataclasses import dataclass
from pathlib import Path


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

    config: dict[str, object] = {
        "admin": {"disabled": True},
        "apps": {
            "http": {
                "servers": {
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
                    "wire": _wire_server_config(
                        wire, transport, idle_timeout, read_timeout
                    ),
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
            }
        },
    }

    config_file = tmp_dir / "caddy.json"
    config_file.write_text(json.dumps(config))

    proc = subprocess.Popen(
        ["caddy", "run", "--config", str(config_file)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    for port in (good.listen_port, wire.listen_port, dead.listen_port):
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
    connect_timeout: str = "5s",
    server_timeout: str = "30s",
    client_timeout: str = "30s",
) -> subprocess.Popen[bytes]:
    """Start an HAProxy reverse proxy subprocess with two frontends and a dead upstream.

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

    config_file = tmp_dir / "haproxy.cfg"
    config_file.write_text(config_content)

    proc = subprocess.Popen(
        ["haproxy", "-f", str(config_file)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    for port in (good.listen_port, wire.listen_port, dead.listen_port):
        try:
            _wait_for_port(port)
        except TimeoutError:
            proc.terminate()
            proc.wait(timeout=5)
            stderr = proc.stderr.read() if proc.stderr else b""
            msg = f"HAProxy failed to start: {stderr.decode(errors='replace')}"
            raise RuntimeError(msg) from None

    return proc
