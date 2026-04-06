"""Root-level conftest for early pytest hooks.

Hooks that must apply before test collection belong here, not in
tests/conftest.py, so they are visible to the main process but not
loaded by xdist worker subprocesses.
"""

from __future__ import annotations

import pytest


@pytest.hookimpl(tryfirst=True)
def pytest_configure(config: pytest.Config) -> None:
    """When --proxy protospy-ext is requested, disable xdist and apply
    fixed target-server port defaults (7300/7301) so the pre-running
    protospy instance can be configured to forward to known ports.

    tryfirst=True ensures this runs before xdist's trylast configure
    and before xdist's pytest_cmdline_main resolves worker count from
    config.option.numprocesses.
    """
    proxy_value: str = str(config.getoption("--proxy", default=""))
    if "protospy-ext" not in [p.strip() for p in proxy_value.split(",")]:
        return

    # Disable xdist: fixed ports conflict with multiple workers each
    # trying to bind the same target-server address.
    config.option.numprocesses = 0

    # Apply fixed target-server port defaults unless the user overrode them.
    if config.getoption("--good-target-port", default=None) is None:
        config.option.good_target_port = 7300
    if config.getoption("--wire-target-port", default=None) is None:
        config.option.wire_target_port = 7301
