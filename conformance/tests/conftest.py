"""Shared fixtures for proxy conformance tests."""

from __future__ import annotations

import json
import urllib.parse
from collections.abc import Generator
from typing import Literal

import httpx
import pytest

from proxy_conformance.good_server import GoodServer
from proxy_conformance.grpc_server import GrpcServer
from proxy_conformance.wire_server import WireServer, register_default_routes

from .proxies import ALL_PROXIES, ProxyUrls, start_proxy

FindingLevel = Literal["info", "finding"]

# Section name used to forward findings from xdist workers to the controller.
_FINDINGS_SECTION = "proxy_findings"


class Findings:
    def __init__(self) -> None:
        self._entries: list[tuple[str, str, FindingLevel]] = []

    def record(self, test_id: str, message: str, level: FindingLevel = "info") -> None:
        self._entries.append((test_id, message, level))


_session_findings = Findings()

# Collected by the controller from worker report sections (xdist mode).
_controller_entries: list[tuple[str, str, FindingLevel]] = []


@pytest.fixture(scope="session")
def findings() -> Findings:
    return _session_findings


def pytest_runtest_makereport(
    item: pytest.Item,
    call: pytest.CallInfo[None],  # type: ignore[type-arg]
) -> pytest.TestReport | None:
    """Attach any findings recorded during a test to the report.

    This runs in the worker process (or the main process when not using
    xdist). xdist serialises report sections and forwards them to the
    controller, so the controller can aggregate findings from all workers.
    """
    # Only attach findings on the call phase to avoid duplicates.
    if call.when != "call":
        return None

    entries = _session_findings._entries
    if not entries:
        return None

    report = pytest.TestReport.from_item_and_call(item, call)
    payload = json.dumps(entries)
    report.sections.append((_FINDINGS_SECTION, payload))
    # Clear so the next test starts fresh within this worker session.
    _session_findings._entries = []
    return report


def pytest_runtest_logreport(report: pytest.TestReport) -> None:
    """Collect findings sections forwarded by xdist workers (controller side)."""
    if report.when != "call":
        return
    for title, payload in report.sections:
        if title == _FINDINGS_SECTION:
            entries: list[tuple[str, str, FindingLevel]] = json.loads(payload)
            _controller_entries.extend(entries)


def pytest_terminal_summary(
    terminalreporter: pytest.TerminalReporter,
    exitstatus: int,
    config: pytest.Config,
) -> None:
    if not config.getoption("--findings"):
        return
    # In xdist mode the controller process collects entries via
    # pytest_runtest_logreport; in plain mode the session findings are local.
    entries = _controller_entries or _session_findings._entries
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
        "--findings",
        action="store_true",
        default=False,
        help="Show proxy behavioral findings in terminal summary.",
    )
    parser.addoption(
        "--proxy",
        default="caddy,haproxy",
        help=(
            "Proxy(ies) under test, comma-separated "
            "(default: caddy,haproxy). "
            "Use 'all' for all supported proxies."
        ),
    )
    parser.addoption(
        "--proxy-url",
        default=None,
        help=(
            "Skip proxy lifecycle and use this URL directly. "
            "The caller is responsible for configuring the proxy to forward "
            "to the target server ports (see --good-target-port, --wire-target-port)."
        ),
    )
    parser.addoption(
        "--good-target-port",
        type=int,
        default=None,
        help="Fix the GoodServer port (default: random). Useful with --proxy-url.",
    )
    parser.addoption(
        "--wire-target-port",
        type=int,
        default=None,
        help="Fix the WireServer port (default: random). Useful with --proxy-url.",
    )


def _get_proxy_list(config: pytest.Config) -> list[str]:
    raw = str(config.getoption("--proxy"))
    if raw == "all":
        return list(ALL_PROXIES)
    return [p.strip() for p in raw.split(",") if p.strip()]


def pytest_generate_tests(metafunc: pytest.Metafunc) -> None:
    """Parametrize tests over the requested proxy list.

    Any test requesting the ``proxy_type`` fixture (directly, or
    indirectly via ``proxy``, ``proxy_name``, or ``timeout_proxy``)
    will be run once per proxy in the ``--proxy`` list.
    """
    needs = {"proxy", "proxy_name", "proxy_type", "timeout_proxy"}
    if not needs & set(metafunc.fixturenames):
        return
    proxy_list = _get_proxy_list(metafunc.config)
    metafunc.parametrize(
        "proxy_type",
        proxy_list,
        indirect=True,
        scope="module",
    )


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    """Assign xdist_group markers so ``--dist loadgroup`` keeps tests
    sharing a module-scoped proxy fixture on the same worker.

    Group key: ``<module>:<proxy_type>`` (e.g. ``test_hop_by_hop:caddy``).
    Tests without proxy parametrization get grouped by module only.
    """
    for item in items:
        # Extract proxy_type from parametrize markers
        proxy = None
        for marker in item.iter_markers("parametrize"):
            if marker.args and marker.args[0] == "proxy_type":
                # The parameter values are in callspec
                break
        # Access the resolved param from the callspec
        callspec = getattr(item, "callspec", None)
        if callspec and "proxy_type" in callspec.params:
            proxy = callspec.params["proxy_type"]
        mod = getattr(item, "module", None)
        module = mod.__name__ if mod is not None else item.nodeid
        group = f"{module}:{proxy}" if proxy else module
        item.add_marker(pytest.mark.xdist_group(group))


@pytest.fixture(scope="module")
def proxy_type(request: pytest.FixtureRequest) -> str:
    """The proxy type for the current parametrized run."""
    return str(request.param)


@pytest.fixture(scope="session")
def good_server(request: pytest.FixtureRequest) -> Generator[GoodServer]:
    port = request.config.getoption("--good-target-port")
    server = GoodServer() if port is None else GoodServer(port=port)
    server.start()
    yield server
    server.stop()


@pytest.fixture(scope="session")
def wire_server(request: pytest.FixtureRequest) -> Generator[WireServer]:
    port = request.config.getoption("--wire-target-port")
    server = WireServer() if port is None else WireServer(port=port)
    register_default_routes(server)
    server.start()
    yield server
    server.stop()


@pytest.fixture(scope="session")
def grpc_server() -> Generator[GrpcServer]:
    server = GrpcServer()
    server.start()
    yield server
    server.stop()


@pytest.fixture(scope="module")
def proxy(
    request: pytest.FixtureRequest,
    proxy_type: str,
    good_server: GoodServer,
    wire_server: WireServer,
    grpc_server: GrpcServer,
    tmp_path_factory: pytest.TempPathFactory,
) -> Generator[ProxyUrls]:
    """ProxyUrls for the proxy under test.

    Proxy choice comes from the ``proxy_type`` fixture (parametrized
    via ``--proxy``).  Pass ``--proxy-url`` to skip lifecycle management
    and use an externally-started proxy instead.
    """
    proxy_url = request.config.getoption("--proxy-url")

    if proxy_url is not None:
        parsed = urllib.parse.urlparse(proxy_url)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 80
        yield ProxyUrls(
            good_url=proxy_url,
            wire_url=proxy_url,
            good_host=host,
            good_port=port,
            wire_host=host,
            wire_port=port,
            dead_url="",
            dead_host="",
            dead_port=0,
        )
        return

    tmp = tmp_path_factory.mktemp(proxy_type)
    proc, urls = start_proxy(
        proxy_type,
        good_server.url,
        wire_server.url,
        tmp,
        grpc_upstream=grpc_server.url,
    )
    try:
        yield urls
    finally:
        proc.terminate()
        proc.wait(timeout=5)


@pytest.fixture(scope="module")
def proxy_name(proxy_type: str) -> str:
    """The name of the proxy under test."""
    return proxy_type


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
def _check_wire_server(wire_server: WireServer) -> Generator[None]:
    """Clear the wire server queue and verify no handler exception after each test."""
    wire_server.clear()
    wire_server._handler_exception = None
    yield
    wire_server.raise_if_handler_failed()
