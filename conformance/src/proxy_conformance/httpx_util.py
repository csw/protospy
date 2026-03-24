from collections.abc import Iterable

import httpx


def _fmt_header_lines(headers: httpx.Headers) -> Iterable[str]:
    return (f"{h}: {v}" for h, v in headers.multi_items())


def _fmt_headers(headers: httpx.Headers) -> str:
    return "\n".join(_fmt_header_lines(headers))


def dump_request(request: httpx.Request) -> str:
    return f"{request.method} {request.url}\n" + _fmt_headers(request.headers) + "\n"


def dump_response(response: httpx.Response) -> str:
    return (
        f"{response.http_version} {response.status_code} {response.reason_phrase}\n"
        + _fmt_headers(response.headers)
        + "\n"
    )
