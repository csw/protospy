"""Shared request-capture types used by both GoodServer and WireServer."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CapturedRequest:
    """A request as observed by a target server."""

    method: str
    path: str
    headers: dict[str, list[str]]
    body: bytes

    def header_values(self, name: str) -> list[str]:
        """Get all values for a header name (case-insensitive)."""
        return self.headers.get(name.lower(), [])

    def header_joined(self, name: str) -> str | None:
        """Get a header's values joined with ', ' (case-insensitive)."""
        values = self.header_values(name)
        return ", ".join(values) if values else None

    def debug_str(self) -> str:
        """Return a string representation suitable for debug output."""

        header_lines = (
            f"{header}: {val}"
            for (header, vals) in self.headers.items()
            for val in vals
        )
        return f"{self.method} {self.path}\n" + "\n".join(header_lines) + "\n"
