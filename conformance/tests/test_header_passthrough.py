"""Header passthrough conformance tests (categories 11, 12, 13).

§11: Cache-related headers pass through unmodified.
§12: Content-related headers pass through unmodified.
§13: Multiple header values and whitespace preserved.
"""

from __future__ import annotations

import gzip
import urllib.parse

import httpx
import pytest

from proxy_conformance.good_server import GoodServer

from .proxies import (
    ProxyUrls,
    tagged_url,  # noqa: E402
)

# Category 11: Cache header passthrough

CACHE_RESPONSE_HEADERS = [
    ("Cache-Control", "no-cache, no-store"),
    ("Expires", "Wed, 01 Jan 2025 00:00:00 GMT"),
    ("ETag", '"abc123"'),
    ("Last-Modified", "Tue, 01 Jan 2024 00:00:00 GMT"),
    ("Age", "3600"),
    ("Vary", "Accept-Encoding"),
    ("Pragma", "no-cache"),
]


@pytest.mark.parametrize(
    "header_name,header_value",
    CACHE_RESPONSE_HEADERS,
    ids=lambda x: x[0] if isinstance(x, tuple) else str(x),
)
def test_cache_response_header_passthrough(
    proxy: ProxyUrls,
    good_server: GoodServer,
    client: httpx.Client,
    header_name: str,
    header_value: str,
) -> None:
    """Cache response headers pass through upstream to client unchanged (§11.1)."""
    encoded_value = urllib.parse.quote(header_value, safe="")
    url = tagged_url(
        f"{proxy.good_url}/headers?{header_name}={encoded_value}",
        "cache-response-headers",
    )
    response = client.get(url)
    assert response.status_code == 200
    # Header names are case-insensitive; httpx lowercases them
    actual = response.headers.get(header_name.lower()) or response.headers.get(
        header_name
    )
    assert actual is not None, f"Header {header_name!r} not found in response"
    assert header_value in actual, (
        f"Header {header_name!r}: expected {header_value!r}, got {actual!r}"
    )
    good_server.clear()


def test_cache_request_headers_forwarded(
    proxy: ProxyUrls,
    good_server: GoodServer,
    client: httpx.Client,
) -> None:
    """Cache request headers pass through client to upstream unchanged (§11.2)."""
    response = client.get(
        tagged_url(f"{proxy.good_url}/echo", "cache-request-headers"),
        headers={
            "If-None-Match": '"abc123"',
            "If-Modified-Since": "Wed, 21 Oct 2025 07:28:00 GMT",
            "Cache-Control": "no-cache",
        },
    )
    assert response.status_code == 200
    captured = good_server.last_request()
    assert '"abc123"' in (captured.header_joined("if-none-match") or "")
    assert "Wed, 21 Oct 2025 07:28:00 GMT" in (
        captured.header_joined("if-modified-since") or ""
    )
    assert "no-cache" in (captured.header_joined("cache-control") or "")


# Category 12: Content header passthrough

CONTENT_RESPONSE_HEADERS = [
    ("Content-Type", "application/json"),
    ("Content-Language", "en-US"),
    ("Content-Disposition", "attachment; filename=test.txt"),
    ("Content-Range", "bytes 0-499/1000"),
]


@pytest.mark.parametrize(
    "header_name,header_value",
    CONTENT_RESPONSE_HEADERS,
    ids=lambda x: x[0] if isinstance(x, tuple) else str(x),
)
def test_content_response_header_passthrough(
    proxy: ProxyUrls,
    good_server: GoodServer,
    client: httpx.Client,
    header_name: str,
    header_value: str,
) -> None:
    """Content response headers pass through upstream to client unchanged (§12.1)."""
    encoded_value = urllib.parse.quote(header_value, safe="=;")
    url = tagged_url(
        f"{proxy.good_url}/headers?{header_name}={encoded_value}",
        "content-response-headers",
    )
    response = client.get(url)
    assert response.status_code == 200
    actual = response.headers.get(header_name.lower()) or response.headers.get(
        header_name
    )
    assert actual is not None, f"Header {header_name!r} not found in response"
    assert header_value in actual, (
        f"Header {header_name!r}: expected {header_value!r}, got {actual!r}"
    )
    good_server.clear()


def test_content_encoding_not_altered(
    proxy: ProxyUrls,
    good_server: GoodServer,
) -> None:
    """Proxy forwards gzip-encoded body without decompressing it (§12.2).

    Uses iter_raw() to read the wire bytes before httpx's transparent
    content-decoding, so we can verify the body is still valid gzip.
    """
    url = tagged_url(
        f"{proxy.good_url}/body/gzip?size=100",
        "content-encoding-not-altered",
    )
    with httpx.Client(trust_env=False) as raw_client:
        with raw_client.stream("GET", url) as response:
            assert response.status_code == 200
            assert response.headers.get("content-encoding") == "gzip", (
                "Proxy should preserve Content-Encoding: gzip"
            )
            raw_body = b"".join(response.iter_raw())
    # Body must still be valid gzip (proxy didn't decompress it)
    decompressed = gzip.decompress(raw_body)
    assert len(decompressed) == 100
    good_server.clear()


# Category 13: Header preservation details


def test_multiple_values_forwarded(
    proxy: ProxyUrls,
    good_server: GoodServer,
    client: httpx.Client,
) -> None:
    """Multiple values for the same request header are both forwarded (§13.1)."""
    # Use list of tuples to send duplicate headers
    response = client.get(
        tagged_url(f"{proxy.good_url}/echo", "multiple-values-same-header"),
        headers=[("Accept", "text/html"), ("Accept", "application/json")],
    )
    assert response.status_code == 200
    captured = good_server.last_request()
    accept_values = captured.header_values("accept")
    assert len(accept_values) >= 1  # at minimum the header arrived
    # Both values should be present (may be merged into one comma-separated value)
    joined = ", ".join(accept_values)
    assert "text/html" in joined
    assert "application/json" in joined


def test_set_cookie_preserved_separately(
    proxy: ProxyUrls,
    good_server: GoodServer,
    client: httpx.Client,
) -> None:
    """Multiple Set-Cookie headers are not collapsed (§13.2)."""
    url = tagged_url(
        (
            f"{proxy.good_url}/headers"
            f"?Set-Cookie={urllib.parse.quote('a=1', safe='')}"
            f"&Set-Cookie={urllib.parse.quote('b=2', safe='')}"
        ),
        "set-cookie-preserved-separately",
    )
    response = client.get(url)
    assert response.status_code == 200
    # httpx exposes multiple Set-Cookie as separate headers
    set_cookies = response.headers.get_list("set-cookie")
    assert len(set_cookies) == 2, (
        f"Expected 2 Set-Cookie headers, got {len(set_cookies)}: {set_cookies}"
    )
    good_server.clear()


def test_header_value_whitespace_preserved(
    proxy: ProxyUrls,
    good_server: GoodServer,
    client: httpx.Client,
) -> None:
    """Header values with internal whitespace are preserved (§13.3)."""
    response = client.get(
        tagged_url(f"{proxy.good_url}/echo", "header-value-whitespace"),
        headers={"X-Spaced": "value  with   spaces"},
    )
    assert response.status_code == 200
    captured = good_server.last_request()
    spaced = captured.header_joined("x-spaced")
    assert spaced is not None
    assert spaced == "value  with   spaces", (
        f"Whitespace not preserved: expected 'value  with   spaces', got {spaced!r}"
    )
