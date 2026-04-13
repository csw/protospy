"""Network utilities for proxy conformance tests."""

from __future__ import annotations

import socket

_WORKER_BASE_PORT = 19000
_WORKER_PORT_STRIDE = 16
_PROXY_PORT_OFFSET = 4


def find_free_port() -> int:
    """Find an available TCP port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def worker_base_port(worker_id: str) -> int:
    """Return the base port for the given xdist worker ID.

    Maps "master" (non-xdist or controller) to index 0, "gw0" to 0,
    "gw1" to 1, etc.
    """
    if worker_id == "master":
        index = 0
    else:
        index = int(worker_id.lstrip("gw"))
    return _WORKER_BASE_PORT + index * _WORKER_PORT_STRIDE


class PortAllocator:
    """Allocates deterministic ports for a single xdist worker.

    Slots 0-3 are allocated sequentially via alloc() for session-scoped
    server fixtures. Slots 4+ are fixed per worker for proxy listen ports.
    """

    def __init__(self, base: int) -> None:
        self._base = base
        self._next = base

    def alloc(self) -> int:
        """Return the next sequential port from this worker's range."""
        port = self._next
        self._next += 1
        return port

    @property
    def proxy_base(self) -> int:
        """Fixed base for proxy listen ports (offset 4 from worker base)."""
        return self._base + _PROXY_PORT_OFFSET
