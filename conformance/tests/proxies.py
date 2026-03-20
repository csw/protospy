"""Helpers for starting proxy subprocesses under test."""

from __future__ import annotations

import socket
import subprocess
import time
import urllib.parse
from pathlib import Path


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


def start_caddy(
    good_upstream: str,
    good_proxy_port: int,
    bad_upstream: str,
    bad_proxy_port: int,
    tmp_dir: Path,
) -> subprocess.Popen[bytes]:
    """Start a Caddy reverse proxy subprocess with two upstreams.

    Returns the Popen handle. The caller is responsible for terminating it.
    """
    caddyfile_content = f"""\
{{
    admin off
}}

:{good_proxy_port} {{
    reverse_proxy {good_upstream}
}}

:{bad_proxy_port} {{
    reverse_proxy {bad_upstream}
}}
"""

    caddyfile = tmp_dir / "Caddyfile"
    caddyfile.write_text(caddyfile_content)

    proc = subprocess.Popen(
        ["caddy", "run", "--config", str(caddyfile), "--adapter", "caddyfile"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    for port in (good_proxy_port, bad_proxy_port):
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
    good_upstream: str,
    good_proxy_port: int,
    bad_upstream: str,
    bad_proxy_port: int,
    tmp_dir: Path,
) -> subprocess.Popen[bytes]:
    """Start an HAProxy reverse proxy subprocess with two frontends.

    Returns the Popen handle. The caller is responsible for terminating it.
    """
    # HAProxy backend server directives take host:port, not full URLs.
    good_hostport = urllib.parse.urlparse(good_upstream).netloc
    bad_hostport = urllib.parse.urlparse(bad_upstream).netloc

    config_content = f"""\
global
    maxconn 256

defaults
    mode http
    timeout connect 5s
    timeout client 30s
    timeout server 30s
    option forwardfor

frontend good_frontend
    bind :{good_proxy_port}
    http-request add-header Via "1.1 haproxy"
    default_backend good_backend

backend good_backend
    server upstream {good_hostport}

frontend bad_frontend
    bind :{bad_proxy_port}
    http-request add-header Via "1.1 haproxy"
    default_backend bad_backend

backend bad_backend
    server upstream {bad_hostport}
"""

    config_file = tmp_dir / "haproxy.cfg"
    config_file.write_text(config_content)

    proc = subprocess.Popen(
        ["haproxy", "-f", str(config_file)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    for port in (good_proxy_port, bad_proxy_port):
        try:
            _wait_for_port(port)
        except TimeoutError:
            proc.terminate()
            proc.wait(timeout=5)
            stderr = proc.stderr.read() if proc.stderr else b""
            msg = f"HAProxy failed to start: {stderr.decode(errors='replace')}"
            raise RuntimeError(msg) from None

    return proc
