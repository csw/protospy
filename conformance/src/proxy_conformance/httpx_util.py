import sys
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


def _curl_request_lines(request: httpx.Request) -> Iterable[str]:
    path = request.url.raw_path.decode()
    yield f"> {request.method} {path} HTTP/1.1"
    for h, v in request.headers.multi_items():
        yield f"> {h}: {v}"
    yield ">"


def _curl_response_lines(response: httpx.Response) -> Iterable[str]:
    yield (f"< {response.http_version} {response.status_code} {response.reason_phrase}")
    for h, v in response.headers.multi_items():
        yield f"< {h}: {v}"
    yield "<"
    cl = response.headers.get("content-length")
    te = response.headers.get("transfer-encoding", "")
    if cl is not None:
        yield f"* Response body: {cl} bytes"
    elif "chunked" in te.lower():
        yield "* Response body: chunked (length unknown)"
    else:
        yield "* Response body: (no content-length)"


def verbose_request_hook(request: httpx.Request) -> None:
    print("\n".join(_curl_request_lines(request)), file=sys.stderr)


def verbose_response_hook(response: httpx.Response) -> None:
    print("\n".join(_curl_response_lines(response)), file=sys.stderr)
