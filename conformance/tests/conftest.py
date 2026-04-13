"""Shared fixtures for proxy conformance tests."""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
from collections.abc import Generator
from pathlib import Path
from subprocess import TimeoutExpired
from typing import Literal, cast

import httpx
import pytest

from proxy_conformance.good_server import GoodServer
from proxy_conformance.grpc_server import GrpcServer
from proxy_conformance.h2c_server import H2cServer
from proxy_conformance.net import PortAllocator, worker_base_port
from proxy_conformance.wire_server import WireServer, register_default_routes

from .proxies import (
    ALL_PROXIES,
    MANAGED_PROXIES,
    PROXY_FAMILIES,
    ProxyUrls,
    start_proxy,
)

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

# protospy log file path per test module (keyed by module __name__).
_protospy_log_paths: dict[str, Path] = {}

# Per-test capture state: nodeid -> (log_path, byte offset before test).
_protospy_captures: dict[str, tuple[Path, int]] = {}


@pytest.fixture(scope="session")
def findings() -> Findings:
    return _session_findings


@pytest.fixture(scope="session")
def port_allocator(request: pytest.FixtureRequest) -> PortAllocator:
    worker_id = getattr(request.config, "workerinput", {}).get("workerid", "master")
    return PortAllocator(worker_base_port(worker_id))


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


@pytest.hookimpl(tryfirst=True)
def pytest_runtest_logreport(report: pytest.TestReport) -> None:
    """Collect findings from xdist workers; attach protospy output on failure."""
    if report.when != "call":
        return
    for title, payload in report.sections:
        if title == _FINDINGS_SECTION:
            entries: list[tuple[str, str, FindingLevel]] = json.loads(payload)
            _controller_entries.extend(entries)
    capture = _protospy_captures.pop(report.nodeid, None)
    if capture is not None:
        log_path, offset = capture
        if log_path.exists():
            with open(log_path, "rb") as f:
                f.seek(offset)
                output = f.read().decode(errors="replace")
            if output.strip():
                report.sections.append(("protospy output", output))


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
        level_entries = sorted((tid, msg) for tid, msg, lvl in entries if lvl == level)
        if not level_entries:
            continue
        terminalreporter.write_line(f"\n[{level.capitalize()}:]")
        for test_id, message in level_entries:
            terminalreporter.write_line(f"  {test_id}: {message}")


def pytest_sessionfinish(session: pytest.Session) -> None:
    """Write findings to the GitHub Actions step summary when running in CI."""
    # In xdist mode each worker also fires this hook.  Only the controller
    # (or the main process when not using xdist) should write the summary.
    if hasattr(session.config, "workerinput"):
        return
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary_path:
        return
    entries = _controller_entries or _session_findings._entries
    if not entries:
        return
    lines: list[str] = ["\n## Proxy Behavioral Findings\n"]
    for level in ("finding", "info"):
        level_entries = sorted((tid, msg) for tid, msg, lvl in entries if lvl == level)
        if not level_entries:
            continue
        lines.append(f"\n**{level.capitalize()}:**\n\n")
        for test_id, message in level_entries:
            lines.append(f"- `{test_id}`: {message}\n")
    with open(summary_path, "a") as f:
        f.writelines(lines)


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--findings",
        action="store_true",
        default=False,
        help="Show proxy behavioral findings in terminal summary.",
    )
    parser.addoption(
        "--show-http",
        action="store_true",
        default=False,
        help=(
            "Print request/response details (curl -v style) to stderr. "
            "Pass -s to see output in real time."
        ),
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
    parser.addoption(
        "--protospy-ext-host",
        default="127.0.0.1",
        help="Host where pre-running protospy listens (default: 127.0.0.1).",
    )
    parser.addoption(
        "--protospy-ext-good-port",
        type=int,
        default=7400,
        help="Protospy frontend port for the good channel (default: 7400).",
    )
    parser.addoption(
        "--protospy-ext-wire-port",
        type=int,
        default=7401,
        help="Protospy frontend port for the wire channel (default: 7401).",
    )
    parser.addoption(
        "--protospy-ext-dead-port",
        type=int,
        default=7402,
        help="Protospy frontend port for the dead channel (default: 7402).",
    )


def _get_proxy_list(config: pytest.Config) -> list[str]:
    raw = str(config.getoption("--proxy"))
    if raw == "all":
        return list(MANAGED_PROXIES)
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


@pytest.fixture(scope="function", autouse=True)
def check_xfail_for(proxy_type: str, request: pytest.FixtureRequest):
    node: pytest.Function = cast(pytest.Function, request.node)
    if m := node.get_closest_marker("xfail_for"):
        # print(f"node: {type(request.node)}: {request.node}", file=sys.stderr)
        if not m.args:
            raise RuntimeError("No family arg for xfail_for marker!")

        family = cast(str, m.args[0])
        proxies = PROXY_FAMILIES.get(family)
        if proxies is None:
            raise RuntimeError(f"Unknown proxy family: {family}")
        if proxy_type in proxies:
            request.applymarker(
                pytest.mark.xfail(reason=f"expected to fail for {family}", strict=True)
            )


@pytest.fixture(scope="session")
def good_server(
    request: pytest.FixtureRequest,
    port_allocator: PortAllocator,
) -> Generator[GoodServer]:
    cli_port: int | None = request.config.getoption("--good-target-port")
    port = cli_port if cli_port is not None else port_allocator.alloc()
    server = GoodServer(port=port)
    server.start()
    yield server
    server.stop()


@pytest.fixture(scope="session")
def wire_server(
    request: pytest.FixtureRequest,
    port_allocator: PortAllocator,
) -> Generator[WireServer]:
    cli_port: int | None = request.config.getoption("--wire-target-port")
    port = cli_port if cli_port is not None else port_allocator.alloc()
    server = WireServer(port=port)
    register_default_routes(server)
    server.start()
    yield server
    server.stop()


@pytest.fixture(scope="session")
def grpc_server(port_allocator: PortAllocator) -> Generator[GrpcServer]:
    server = GrpcServer(port=port_allocator.alloc())
    server.start()
    yield server
    server.stop()


@pytest.fixture(scope="session")
def h2c_server(port_allocator: PortAllocator) -> Generator[H2cServer]:
    server = H2cServer(port=port_allocator.alloc())
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
    h2c_server: H2cServer,
    tmp_path_factory: pytest.TempPathFactory,
    port_allocator: PortAllocator,
) -> Generator[ProxyUrls]:
    """ProxyUrls for the proxy under test.

    Proxy choice comes from the ``proxy_type`` fixture (parametrized
    via ``--proxy``).  Pass ``--proxy-url`` to skip lifecycle management
    and use an externally-started proxy instead.
    """
    if proxy_type not in ALL_PROXIES:
        supported = ", ".join(ALL_PROXIES)
        msg = f"Unknown proxy type: {proxy_type!r}. Supported: {supported}."
        raise ValueError(msg)

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

    if proxy_type == "protospy-ext":
        host: str = request.config.getoption("--protospy-ext-host")
        good_port: int = request.config.getoption("--protospy-ext-good-port")
        wire_port: int = request.config.getoption("--protospy-ext-wire-port")
        dead_port: int = request.config.getoption("--protospy-ext-dead-port")
        yield ProxyUrls(
            good_url=f"http://{host}:{good_port}",
            wire_url=f"http://{host}:{wire_port}",
            good_host=host,
            good_port=good_port,
            wire_host=host,
            wire_port=wire_port,
            dead_url=f"http://{host}:{dead_port}",
            dead_host=host,
            dead_port=dead_port,
        )
        return

    tmp = tmp_path_factory.mktemp(proxy_type)
    proc, urls = start_proxy(
        proxy_type,
        good_server.url,
        wire_server.url,
        tmp,
        grpc_upstream=grpc_server.url,
        h2c_upstream=h2c_server.url,
        base_port=port_allocator.proxy_base,
    )
    if proxy_type == "protospy":
        _protospy_log_paths[request.module.__name__] = tmp / "protospy.log"
    try:
        yield urls
    finally:
        proc.terminate()
        try:
            _ = proc.wait(timeout=5)
        except TimeoutExpired:
            print(
                f"timeout expired stopping {proxy_type} proxy (pid {proc.pid}), "
                "killing",
                file=sys.stderr,
            )
            proc.kill()
        _protospy_log_paths.pop(request.module.__name__, None)


@pytest.fixture(scope="module")
def proxy_name(proxy_type: str) -> str:
    """The name of the proxy under test."""
    return proxy_type


@pytest.fixture(scope="session")
def client(pytestconfig: pytest.Config) -> Generator[httpx.Client]:
    """httpx client configured to ignore environment proxy settings."""
    from proxy_conformance.httpx_util import (
        verbose_request_hook,
        verbose_response_hook,
    )

    event_hooks = (
        {
            "request": [verbose_request_hook],
            "response": [verbose_response_hook],
        }
        if pytestconfig.getoption("--show-http")
        else {}
    )
    with httpx.Client(trust_env=False, event_hooks=event_hooks) as c:
        yield c


@pytest.fixture(autouse=True)
def _protospy_output_capture(request: pytest.FixtureRequest) -> Generator[None]:
    """Record protospy log offset before each test for failure capture."""
    if "proxy_type" not in request.fixturenames:
        yield
        return
    proxy_type: str = request.getfixturevalue("proxy_type")
    if proxy_type != "protospy":
        yield
        return
    log_path = _protospy_log_paths.get(request.module.__name__)
    if log_path is not None and log_path.exists():
        _protospy_captures[request.node.nodeid] = (log_path, log_path.stat().st_size)
    yield


@pytest.fixture(autouse=True)
def _clear_good_requests(good_server: GoodServer) -> None:
    """Drain any leftover requests between tests."""
    good_server.clear()


@pytest.fixture(autouse=True)
def _clear_h2c_requests(h2c_server: H2cServer) -> None:
    """Drain any leftover H2c captured requests between tests."""
    h2c_server.clear()


@pytest.fixture(autouse=True)
def _check_wire_server(wire_server: WireServer) -> Generator[None]:
    """Clear the wire server queue and verify no handler exception after each test."""
    wire_server.clear()
    wire_server._handler_exception = None
    yield
    wire_server.raise_if_handler_failed()
