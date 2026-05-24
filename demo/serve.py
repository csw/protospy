#!/usr/bin/env python3
"""Minimal static file server for demo/content/.

Uses BaseHTTPRequestHandler directly (not SimpleHTTPRequestHandler) to avoid
the directory file-descriptor caching introduced in Python 3.12 as a path-
traversal security fix. That caching causes persistent 404s after git rewrites
files (unlink + create), because the cached FD refers to the old inode.

Opens files fresh per request — stateless, restart-proof.
"""

import http.server
import mimetypes
import os
import sys

CONTENT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "content"))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        path = self.path.split("?")[0].split("#")[0]
        if path == "/":
            path = "/index.html"
        filepath = os.path.join(CONTENT_DIR, path.lstrip("/"))
        if not os.path.abspath(filepath).startswith(CONTENT_DIR + os.sep):
            self.send_error(403)
            return
        try:
            with open(filepath, "rb") as f:
                data = f.read()
        except FileNotFoundError:
            self.send_error(404)
            return
        mime, _ = mimetypes.guess_type(filepath)
        self.send_response(200)
        self.send_header("Content-Type", mime or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.address_string()} - {fmt % args}", flush=True)


if __name__ == "__main__":
    with http.server.HTTPServer(("", PORT), Handler) as httpd:
        print(f"Serving {CONTENT_DIR} on http://localhost:{PORT}", flush=True)
        httpd.serve_forever()
