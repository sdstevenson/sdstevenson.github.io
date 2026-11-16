#!/usr/bin/env python3
"""Local preview server with clean URLs, matching how the live site serves pages.

Links on the site point to extensionless paths such as `calendar` or `aircraft-owners`.
Plain `python -m http.server` returns 404 for those, so this server maps `/calendar` to
`calendar.html` when that file exists. Everything else is served as-is. Dev only.

Usage: python scripts/dev_server.py [port]   (default 55015, bound to 127.0.0.1)
"""

from __future__ import annotations

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parent.parent


class CleanUrlHandler(SimpleHTTPRequestHandler):
    def _rewrite_clean_url(self) -> None:
        parts = urlsplit(self.path)
        path = parts.path
        if path != "/" and not path.endswith("/") and "." not in path.rsplit("/", 1)[-1]:
            if (ROOT / (path.lstrip("/") + ".html")).is_file():
                self.path = urlunsplit(parts._replace(path=path + ".html"))

    def do_GET(self) -> None:
        self._rewrite_clean_url()
        super().do_GET()

    def do_HEAD(self) -> None:
        self._rewrite_clean_url()
        super().do_HEAD()

    def end_headers(self) -> None:
        # Always fetch fresh files while editing.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 55015
    handler = partial(CleanUrlHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"Serving {ROOT} at http://127.0.0.1:{port}/ (clean URLs on)")
        server.serve_forever()


if __name__ == "__main__":
    main()
