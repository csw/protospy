"""Shared request logging for echo and bad server."""

from __future__ import annotations

import sys


def format_request(method: str, path: str, body_len: int) -> str:
    """Human-readable single-line summary of a request."""
    return f"{method} {path}  ({body_len} body bytes)"


def log_request(method: str, path: str, body_len: int, *, label: str = "") -> None:
    """Print a request summary to stderr."""
    prefix = f"[{label}] " if label else ""
    msg = f"{prefix}{format_request(method, path, body_len)}"
    print(msg, file=sys.stderr, flush=True)
