#!/usr/bin/env python3
"""Check or generate the shared navigation and footer in root HTML pages."""

from __future__ import annotations

import argparse
from html.parser import HTMLParser
from html import escape
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PARTIALS = ROOT / "scripts" / "partials"
NAV_START = "<!-- starlight-shared-nav:start -->"
NAV_END = "<!-- starlight-shared-nav:end -->"
FOOTER_START = "<!-- starlight-shared-footer:start -->"
FOOTER_END = "<!-- starlight-shared-footer:end -->"
CSS_START = "<!-- starlight-shared-css:start -->"
CSS_END = "<!-- starlight-shared-css:end -->"


class CanonicalParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.urls: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "link":
            return
        values = {key.lower(): value for key, value in attrs}
        rel = (values.get("rel") or "").lower().split()
        href = values.get("href")
        if "canonical" in rel and href:
            self.urls.append(href)


def replace_block(source: str, start: str, end: str, value: str) -> str:
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.DOTALL)
    replacement = f"{start}\n{value}\n{end}"
    if pattern.search(source):
        return pattern.sub(lambda _: replacement, source, count=1)
    return ""


def generate(source: str, nav: str, footer: str) -> str:
    text = source.replace("\r\n", "\n")

    nav_template = f'<header id="starlight-nav-header">\n{nav}</header>'
    nav_replacement = replace_block(text, NAV_START, NAV_END, nav_template)
    if nav_replacement:
        text = nav_replacement
    else:
        header = re.search(r"<header\b[^>]*>.*?</header\s*>", text, re.I | re.S)
        if header and not re.search(r"\bclass\s*=\s*([\"'])[^\"']*\bhome\b", header.group(0), re.I):
            text = text[: header.start()] + f"{NAV_START}\n{nav_template}\n{NAV_END}" + text[header.end() :]

    footer_template = f'<footer data-bg-type="dark" class="starlight-footer">\n{footer}</footer>'
    footer_replacement = replace_block(text, FOOTER_START, FOOTER_END, footer_template)
    if footer_replacement:
        text = footer_replacement
    else:
        footer_match = re.search(r"<footer\b[^>]*>.*?</footer\s*>", text, re.I | re.S)
        if footer_match:
            text = text[: footer_match.start()] + f"{FOOTER_START}\n{footer_template}\n{FOOTER_END}" + text[footer_match.end() :]

    css_link = '<link rel="stylesheet" href="assets/shared.css?v=20261027-2" />'
    css_replacement = replace_block(text, CSS_START, CSS_END, css_link)
    if css_replacement:
        text = css_replacement
    else:
        head_close = re.search(r"</head\s*>", text, re.I)
        if head_close:
            text = text[: head_close.start()] + f"{CSS_START}\n{css_link}\n{CSS_END}\n" + text[head_close.start() :]

    return text


def crlf_bytes(text: str) -> bytes:
    return text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\r\n").encode("utf-8")


def generate_sitemap() -> str:
    urls: set[str] = set()
    for path in sorted(ROOT.glob("*.html")):
        parser = CanonicalParser()
        parser.feed(path.read_text(encoding="utf-8"))
        urls.update(parser.urls)
    entries = "\n".join(
        f"  <url><loc>{escape(url)}</loc></url>" for url in sorted(urls)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{entries}\n"
        "</urlset>\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="report stale generated pages (default)")
    mode.add_argument("--write", action="store_true", help="write generated page updates")
    args = parser.parse_args()

    nav = (PARTIALS / "nav.html").read_text(encoding="utf-8").rstrip("\r\n")
    footer = (PARTIALS / "footer.html").read_text(encoding="utf-8").rstrip("\r\n")
    stale: list[Path] = []
    for path in sorted(ROOT.glob("*.html")):
        original = path.read_bytes().decode("utf-8").replace("\r\n", "\n")
        generated = generate(original, nav, footer)
        if generated != original:
            stale.append(path)
            if args.write:
                path.write_bytes(crlf_bytes(generated))

    sitemap_path = ROOT / "sitemap.xml"
    sitemap = generate_sitemap()
    current_sitemap = sitemap_path.read_bytes().decode("utf-8").replace("\r\n", "\n") if sitemap_path.exists() else None
    sitemap_stale = current_sitemap != sitemap
    if sitemap_stale and args.write:
        sitemap_path.write_bytes(crlf_bytes(sitemap))

    if (stale or sitemap_stale) and not args.write:
        print("Shared site output needs generation:")
        for path in stale:
            print(f"  {path.name}")
        if sitemap_stale:
            print("  sitemap.xml")
        return 1
    if args.write:
        print(f"Updated {len(stale)} HTML page(s) and {'sitemap.xml' if sitemap_stale else 'no sitemap'}.")
    else:
        print("Generated shared site output is current.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
