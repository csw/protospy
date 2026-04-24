"""Proxy target taxonomy for the conformance suite.

Single source of truth for the set of proxies the suite knows about,
their families (used by ``xfail_for`` marks and ``proxy_quirks`` lookups),
and a small helper for resolving a concrete proxy name to its family.

Subprocess management for the managed proxies lives in
``conformance/tests/proxies.py``; this module is intentionally free of
test-harness imports so it can be used by ``proxy_conformance.types``
without creating a cycle.
"""

from __future__ import annotations

# Proxies whose lifecycle is managed by the test suite (started + stopped
# by the ``proxy`` fixture).
MANAGED_PROXIES: list[str] = [
    "caddy",
    "haproxy",
    "protospy-bypass",
    "protospy-capture",
]

# All valid proxy type strings, including external ones that must be
# selected explicitly and cannot be auto-started.
ALL_PROXIES: list[str] = [*MANAGED_PROXIES, "protospy-ext"]

# Family -> set of concrete proxy types. ``xfail_for("<family>")`` matches
# any concrete proxy in the family's set, and ``proxy_quirks`` lookups
# fall back to the family name when the concrete name is not a key.
PROXY_FAMILIES: dict[str, frozenset[str]] = {
    "caddy": frozenset(["caddy"]),
    "haproxy": frozenset(["haproxy"]),
    "protospy": frozenset(["protospy-bypass", "protospy-capture", "protospy-ext"]),
}


def proxy_family(proxy_type: str) -> str | None:
    """Return the family name a concrete proxy type belongs to, or None."""
    for family, members in PROXY_FAMILIES.items():
        if proxy_type in members:
            return family
    return None
