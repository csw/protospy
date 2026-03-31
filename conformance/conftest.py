"""Root-level conftest for early pytest hooks.

Hooks that must run before test collection (e.g. pytest_cmdline_preparse)
belong here, not in tests/conftest.py, so they are visible to the main
process but not loaded by xdist worker subprocesses.
"""

from __future__ import annotations

import pytest


@pytest.hookimpl(optionalhook=True)
def pytest_cmdline_preparse(config: pytest.Config, args: list[str]) -> None:  # noqa: ARG001
    """When --proxy protospy-ext is requested, disable xdist and inject
    fixed target-server port defaults (7300/7301) so the pre-running
    protospy instance can be configured to forward to known ports.

    addopts in pyproject.toml supplies '-n auto --dist loadgroup'; because
    addopts is prepended before user args are parsed, appending overrides
    here causes our values to win.
    """
    proxy_value: str | None = None
    for i, arg in enumerate(args):
        if arg.startswith("--proxy="):
            proxy_value = arg[len("--proxy=") :]
        elif arg == "--proxy" and i + 1 < len(args):
            proxy_value = args[i + 1]

    if proxy_value is None:
        return
    if "protospy-ext" not in [p.strip() for p in proxy_value.split(",")]:
        return

    # Disable xdist: fixed ports conflict with multiple workers each
    # trying to bind the same target-server address.
    args.extend(["-n", "0"])

    # Inject fixed target-server port defaults unless the user overrode them.
    if not any(a.startswith("--good-target-port") for a in args):
        args.extend(["--good-target-port", "7300"])
    if not any(a.startswith("--wire-target-port") for a in args):
        args.extend(["--wire-target-port", "7301"])
