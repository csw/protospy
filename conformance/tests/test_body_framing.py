"""Body framing conformance tests (category 6).

Tests 6.1–6.4 overlap with categories 1 (1.6, 1.7) and 2 (2.6, 2.7) and are
tested there. This file covers the remaining body framing cases: 6.5–6.7.
"""

from __future__ import annotations

import httpx
import pytest

from proxy_conformance.good_server import GoodServer
from proxy_conformance.types import (
    ClientExpectation,
    HeaderExpectation,
    ProxyTestCase,
    RequestSpec,
    TargetExpectation,
    assert_proxy_test_case,
)

from .proxies import ProxyUrls, tagged_url

_1MB = b"x" * (1024 * 1024)

BODY_FRAMING_TESTS: list[ProxyTestCase] = [
    ProxyTestCase(
        id="head-response-content-length",
        spec_ref="RFC 9110 §9.3.2",
        description="HEAD response includes Content-Length header but no body",
        catalog_ids=["6.5"],
        request=RequestSpec(method="HEAD", path="/body/content-length?size=5000"),
        expect_at_client=ClientExpectation(
            status=200,
            headers=HeaderExpectation(present={"content-length": "5000"}),
            body=b"",
        ),
    ),
    ProxyTestCase(
        id="content-length-zero",
        spec_ref="RFC 9112 §6.2",
        description="POST with empty body and Content-Length: 0",
        catalog_ids=["6.6"],
        request=RequestSpec(
            method="POST",
            path="/echo",
            body=b"",
        ),
        expect_at_target=TargetExpectation(body=b""),
        expect_at_client=ClientExpectation(status=200),
    ),
    ProxyTestCase(
        id="large-body-streaming",
        spec_ref="RFC 9112 §6.2",
        description=("1 MB body — verifies proxy streams rather than buffers entirely"),
        catalog_ids=["6.7"],
        request=RequestSpec(
            method="POST",
            path="/echo",
            body=_1MB,
        ),
        expect_at_target=TargetExpectation(body=_1MB),
        expect_at_client=ClientExpectation(status=200),
    ),
]


@pytest.mark.parametrize("case", BODY_FRAMING_TESTS, ids=lambda c: c.id)
def test_body_framing(
    proxy: ProxyUrls,
    good_server: GoodServer,
    client: httpx.Client,
    case: ProxyTestCase,
    proxy_name: str,
) -> None:
    response = client.request(
        case.request.method,
        tagged_url(f"{proxy.good_url}{case.request.path}", case.id),
        headers=case.request.headers,
        content=case.request.body,
    )
    assert_proxy_test_case(response, good_server, case, proxy_name=proxy_name)
