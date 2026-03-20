"""Shared fixtures for proxy conformance tests."""

from __future__ import annotations

import urllib.parse
from collections.abc import Generator
from dataclasses import dataclass
from typing import Literal

import httpx
import pytest

from proxy_conformance.bad_server import (
    BadServer,
    echo_handler,
    malformed_chunks,
    truncated_body,
)
from proxy_conformance.good_server import GoodServer
from proxy_conformance.net import find_free_port

from .proxies import start_caddy, start_haproxy


def _test_url(url: str, test_id: str) -> str:
    """Append _test=<test_id> query parameter to a URL or path."""
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}_test={test_id}"


@dataclass
class ProxyUrls:
    """URLs for the two proxy upstreams under test."""

    good_url: str
    bad_url: str
    good_host: str
    good_port: int
    bad_host: str
    bad_port: int


FindingLevel = Literal["info", "finding"]


class Findings:
    def __init__(self) -> None:
        self._entries: list[tuple[str, str, FindingLevel]] = []

    def record(self, test_id: str, message: str, level: FindingLevel = "info") -> None:
        self._entries.append((test_id, message, level))


_session_findings = Findings()


@pytest.fixture(scope="session")
def findings() -> Findings:
    return _session_findings


def pytest_terminal_summary(
    terminalreporter: pytest.TerminalReporter,
    exitstatus: int,
    config: pytest.Config,
) -> None:
    entries = _session_findings._entries
    if not entries:
        return
    terminalreporter.write_sep("=", "proxy behavioral findings")
    for level in ("finding", "info"):
        level_entries = [(tid, msg) for tid, msg, lvl in entries if lvl == level]
        if not level_entries:
            continue
        terminalreporter.write_line(f"\n[{level}]")
        for test_id, message in level_entries:
            terminalreporter.write_line(f"  {test_id}: {message}")


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--proxy",
        default="caddy",
        help="Proxy under test (default: caddy)",
    )
    parser.addoption(
        "--proxy-url",
        default=None,
        help=(
            "Skip proxy lifecycle and use this URL directly. "
            "The caller is responsible for configuring the proxy to forward "
            "to the target server ports (see --good-target-port, --bad-target-port)."
        ),
    )
    parser.addoption(
        "--good-target-port",
        type=int,
        default=None,
        help="Fix the GoodServer port (default: random). Useful with --proxy-url.",
    )
    parser.addoption(
        "--bad-target-port",
        type=int,
        default=None,
        help="Fix the BadServer port (default: random). Useful with --proxy-url.",
    )


@pytest.fixture(scope="session")
def good_server(request: pytest.FixtureRequest) -> Generator[GoodServer]:
    port = request.config.getoption("--good-target-port")
    server = GoodServer() if port is None else GoodServer(port=port)
    server.start()
    yield server
    server.stop()


@pytest.fixture(scope="session")
def bad_server(request: pytest.FixtureRequest) -> Generator[BadServer]:
    port = request.config.getoption("--bad-target-port")
    server = BadServer() if port is None else BadServer(port=port)
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
    yield server
    server.stop()


@pytest.fixture(scope="module")
def proxy(
    request: pytest.FixtureRequest,
    good_server: GoodServer,
    bad_server: BadServer,
    tmp_path_factory: pytest.TempPathFactory,
) -> Generator[ProxyUrls]:
    """ProxyUrls for the proxy under test.

    Proxy choice is set by --proxy (default: caddy). Pass --proxy-url to
    skip lifecycle management and use an externally-started proxy instead.
    """
    proxy_url = request.config.getoption("--proxy-url")

    if proxy_url is not None:
        # External proxy mode: no lifecycle management. The caller is
        # responsible for starting the proxy and configuring it to forward
        # to good_server.url and bad_server.url.
        parsed = urllib.parse.urlparse(proxy_url)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 80
        yield ProxyUrls(
            good_url=proxy_url,
            bad_url=proxy_url,
            good_host=host,
            good_port=port,
            bad_host=host,
            bad_port=port,
        )
        return

    proxy_type = request.config.getoption("--proxy")

    if proxy_type == "caddy":
        good_port = find_free_port()
        bad_port = find_free_port()
        caddyfile_dir = tmp_path_factory.mktemp("caddy")
        proc = start_caddy(
            good_server.url, good_port, bad_server.url, bad_port, tmp_dir=caddyfile_dir
        )
        try:
            yield ProxyUrls(
                good_url=f"http://127.0.0.1:{good_port}",
                bad_url=f"http://127.0.0.1:{bad_port}",
                good_host="127.0.0.1",
                good_port=good_port,
                bad_host="127.0.0.1",
                bad_port=bad_port,
            )
        finally:
            proc.terminate()
            proc.wait(timeout=5)
    elif proxy_type == "haproxy":
        good_port = find_free_port()
        bad_port = find_free_port()
        haproxy_dir = tmp_path_factory.mktemp("haproxy")
        proc = start_haproxy(
            good_server.url, good_port, bad_server.url, bad_port, tmp_dir=haproxy_dir
        )
        try:
            yield ProxyUrls(
                good_url=f"http://127.0.0.1:{good_port}",
                bad_url=f"http://127.0.0.1:{bad_port}",
                good_host="127.0.0.1",
                good_port=good_port,
                bad_host="127.0.0.1",
                bad_port=bad_port,
            )
        finally:
            proc.terminate()
            proc.wait(timeout=5)
    else:
        msg = (
            f"Unknown proxy type: {proxy_type!r}. "
            "Supported: caddy, haproxy. "
            "To add a new proxy, extend the proxy fixture in conftest.py."
        )
        raise ValueError(msg)


@pytest.fixture(scope="session")
def proxy_name(request: pytest.FixtureRequest) -> str:
    """The name of the proxy under test (from --proxy)."""
    return str(request.config.getoption("--proxy"))


@pytest.fixture(scope="session")
def client() -> Generator[httpx.Client]:
    """httpx client configured to ignore environment proxy settings."""
    with httpx.Client(trust_env=False) as c:
        yield c


@pytest.fixture(autouse=True)
def _clear_good_requests(good_server: GoodServer) -> None:
    """Drain any leftover requests between tests."""
    good_server.clear()


@pytest.fixture(autouse=True)
def _check_bad_server(bad_server: BadServer) -> Generator[None]:
    """Clear the bad server queue and verify no handler exception after each test."""
    bad_server.clear()
    bad_server._handler_exception = None
    yield
    bad_server.raise_if_handler_failed()
