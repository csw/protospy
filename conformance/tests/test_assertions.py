"""Unit tests for assertion helpers in proxy_conformance.types."""

from __future__ import annotations

from unittest.mock import MagicMock

import httpx
import pytest

from proxy_conformance.types import (
    ClientExpectation,
    HeaderExpectation,
    ProbeResult,
    ProxyQuirk,
    ProxyTestCase,
    RequestSpec,
    TargetExpectation,
    assert_client_response,
    assert_headers,
    assert_proxy_test_case,
    send_expecting_error,
)


def _mock_response(
    status_code: int = 200,
    content: bytes = b"",
    headers: dict[str, str] | None = None,
) -> MagicMock:
    response = MagicMock()
    response.status_code = status_code
    response.content = content
    # Build httpx-style multi_items from the headers dict
    items = list((headers or {}).items())
    response.headers.multi_items.return_value = items
    return response


# --- assert_headers: count ---


def test_assert_headers_count_exact() -> None:
    actual = {"x-foo": ["a", "b"]}
    expected = HeaderExpectation(count={"x-foo": 2})
    assert_headers(actual, expected)  # should not raise


def test_assert_headers_count_mismatch() -> None:
    actual = {"x-foo": ["a"]}
    expected = HeaderExpectation(count={"x-foo": 2})
    with pytest.raises(AssertionError, match="x-foo"):
        assert_headers(actual, expected)


def test_assert_headers_count_zero() -> None:
    actual: dict[str, list[str]] = {}
    expected = HeaderExpectation(count={"x-missing": 0})
    assert_headers(actual, expected)  # absent header with count=0 passes


# --- assert_client_response: status_in ---


def test_client_response_status_in_pass() -> None:
    response = _mock_response(status_code=201)
    expected = ClientExpectation(status_in={200, 201, 204})
    assert_client_response(response, expected)  # should not raise


def test_client_response_status_in_fail() -> None:
    response = _mock_response(status_code=404)
    expected = ClientExpectation(status_in={200, 201})
    with pytest.raises(AssertionError, match="Expected status in"):
        assert_client_response(response, expected)


# --- assert_client_response: body ---


def test_client_response_body_exact_pass() -> None:
    response = _mock_response(content=b"hello")
    expected = ClientExpectation(body=b"hello")
    assert_client_response(response, expected)


def test_client_response_body_exact_fail() -> None:
    response = _mock_response(content=b"hello")
    expected = ClientExpectation(body=b"world")
    with pytest.raises(AssertionError, match="Body mismatch"):
        assert_client_response(response, expected)


def test_client_response_body_contains_pass() -> None:
    response = _mock_response(content=b"hello world")
    expected = ClientExpectation(body_contains=b"world")
    assert_client_response(response, expected)


def test_client_response_body_contains_fail() -> None:
    response = _mock_response(content=b"hello world")
    expected = ClientExpectation(body_contains=b"missing")
    with pytest.raises(AssertionError, match="does not contain"):
        assert_client_response(response, expected)


# --- assert_client_response: exact status (existing behavior) ---


def test_client_response_status_exact_pass() -> None:
    response = _mock_response(status_code=200)
    expected = ClientExpectation(status=200)
    assert_client_response(response, expected)


def test_client_response_status_exact_fail() -> None:
    response = _mock_response(status_code=500)
    expected = ClientExpectation(status=200)
    with pytest.raises(AssertionError, match="Expected status 200"):
        assert_client_response(response, expected)


# --- send_expecting_error ---


def test_send_expecting_error_returns_response() -> None:
    client = MagicMock(spec=httpx.Client)
    mock_resp = MagicMock()
    mock_resp.status_code = 502
    mock_resp.content = b"bad gateway"
    mock_resp.headers = httpx.Headers([("content-type", "text/plain")])
    client.request.return_value = mock_resp

    result = send_expecting_error(client, "http://localhost/test")

    assert result.status == 502
    assert result.body == b"bad gateway"
    assert result.headers == {"content-type": ["text/plain"]}


def test_send_expecting_error_connection_drop() -> None:
    client = MagicMock(spec=httpx.Client)
    client.request.side_effect = httpx.RemoteProtocolError("connection closed")

    result = send_expecting_error(client, "http://localhost/test")

    assert result.status is None
    assert result.body == b""
    assert result.headers == {}


def test_probe_result_connection_drop_has_none_status() -> None:
    result = ProbeResult(status=None, body=b"", headers={})
    assert result.status is None


# --- proxy_quirks ---


def _make_case(**quirks: ProxyQuirk) -> ProxyTestCase:
    return ProxyTestCase(
        id="test",
        spec_ref="RFC 0000",
        description="test case",
        request=RequestSpec(),
        proxy_quirks=quirks,
    )


def _mock_captured(
    method: str = "GET",
    path: str = "/",
    body: bytes = b"",
) -> MagicMock:
    """Build a mock CapturedRequest with the given attributes."""
    captured = MagicMock()
    captured.method = method
    captured.path = path
    captured.headers = {}
    captured.body = body
    return captured


def test_proxy_quirk_override_client() -> None:
    """disposition='override' with client replaces the client expectation."""
    case = _make_case(
        caddy=ProxyQuirk(
            disposition="override",
            reason="caddy returns 502 here",
            client=ClientExpectation(status=502),
        )
    )
    response = _mock_response(status_code=502)
    good_server = MagicMock()
    good_server.last_request.return_value = _mock_captured()

    # Should pass: response is 502, caddy quirk overrides expectation to 502
    assert_proxy_test_case(response, good_server, case, proxy_name="caddy")


def test_proxy_quirk_override_target() -> None:
    """disposition='override' with target replaces the target expectation."""
    case = _make_case(
        haproxy=ProxyQuirk(
            disposition="override",
            reason="haproxy injects Keep-Alive",
            target=TargetExpectation(),  # empty: no target assertions
        )
    )
    response = _mock_response(status_code=200)
    good_server = MagicMock()
    good_server.last_request.return_value = _mock_captured()

    assert_proxy_test_case(response, good_server, case, proxy_name="haproxy")


def test_proxy_quirk_falls_back_to_default() -> None:
    """When proxy_name has no quirk, RFC-correct expectations are used."""
    case = _make_case(
        caddy=ProxyQuirk(
            disposition="override",
            reason="caddy returns 502 here",
            client=ClientExpectation(status=502),
        )
    )
    response = _mock_response(status_code=200)  # default expects 200
    good_server = MagicMock()
    good_server.last_request.return_value = _mock_captured()

    # Should pass: no quirk for "protospy", default expects 200
    assert_proxy_test_case(response, good_server, case, proxy_name="protospy")


def test_proxy_quirk_skip() -> None:
    """disposition='skip' triggers pytest.skip for that proxy."""
    case = _make_case(caddy=ProxyQuirk(disposition="skip", reason="not supported"))
    response = _mock_response(status_code=200)
    good_server = MagicMock()

    with pytest.raises(pytest.skip.Exception):
        assert_proxy_test_case(response, good_server, case, proxy_name="caddy")


def test_proxy_quirk_xfail() -> None:
    """disposition='xfail' triggers pytest.xfail for that proxy."""
    case = _make_case(caddy=ProxyQuirk(disposition="xfail", reason="known bug"))
    response = _mock_response(status_code=200)
    good_server = MagicMock()

    with pytest.raises(pytest.xfail.Exception):  # type: ignore[attr-defined]
        assert_proxy_test_case(response, good_server, case, proxy_name="caddy")
