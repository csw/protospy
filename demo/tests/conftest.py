import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

_DEMO_DIR = Path(__file__).parent.parent


def _free_port() -> int:
    """Ask the OS for an unused port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def live_server_url() -> str:  # type: ignore[return]
    port = _free_port()
    url = f"http://127.0.0.1:{port}"
    proc = subprocess.Popen(
        [
            "uv",
            "run",
            "uvicorn",
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=_DEMO_DIR,
    )
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1)  # noqa: S310
            break
        except OSError, urllib.error.URLError:
            time.sleep(0.1)
    else:
        proc.kill()
        raise RuntimeError(f"Server did not start at {url}")
    yield url  # type: ignore[misc]
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


@pytest.fixture(scope="session")
def base_url(live_server_url: str) -> str:
    """Override pytest-playwright's base_url with the dynamic server URL."""
    return live_server_url
