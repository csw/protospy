"""Proxy conformance tests for timeout behavior (§10).

Uses a short-timeout proxy instance via the module-scoped `timeout_proxy`
fixture — separate from the session-scoped proxy to avoid affecting other tests.
"""

from __future__ import annotations

from collections.abc import Generator

import pytest

from proxy_conformance.net import find_free_port
from proxy_conformance.wire_server import WireServer

from .conftest import ProxyUrls
from .proxies import start_caddy, start_haproxy


@pytest.fixture(scope="module")
def timeout_proxy(
    request: pytest.FixtureRequest,
    wire_server: WireServer,
    tmp_path_factory: pytest.TempPathFactory,
) -> Generator[ProxyUrls]:
    """Proxy configured with short upstream timeouts. Wire-only (no GoodServer)."""
    proxy_type = str(request.config.getoption("--proxy"))
    wire_port = find_free_port()
    dead_proxy_port = find_free_port()
    dead_target_port = find_free_port()
    tmp = tmp_path_factory.mktemp("timeout-proxy")
    if proxy_type == "caddy":
        proc = start_caddy(
            wire_server.url,
            wire_port,
            wire_server.url,
            wire_port,
            dead_target_port=dead_target_port,
            dead_proxy_port=dead_proxy_port,
            tmp_dir=tmp,
            dial_timeout="1s",
        )
    else:
        proc = start_haproxy(
            wire_server.url,
            wire_port,
            wire_server.url,
            wire_port,
            dead_target_port=dead_target_port,
            dead_proxy_port=dead_proxy_port,
            tmp_dir=tmp,
            connect_timeout="1s",
            server_timeout="2s",
        )
    try:
        yield ProxyUrls(
            good_url=f"http://127.0.0.1:{wire_port}",
            wire_url=f"http://127.0.0.1:{wire_port}",
            good_host="127.0.0.1",
            good_port=wire_port,
            wire_host="127.0.0.1",
            wire_port=wire_port,
            dead_url=f"http://127.0.0.1:{dead_proxy_port}",
            dead_host="127.0.0.1",
            dead_port=dead_proxy_port,
        )
    finally:
        proc.terminate()
        proc.wait(timeout=5)
