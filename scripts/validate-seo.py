"""Validate public route SEO from server-rendered HTML, without third-party packages.

Usage: python3 scripts/validate-seo.py [http://localhost:8080]
This checks markup and supported schema facts, not Google rich-result eligibility.
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen

ORIGIN = "https://appl-learnote.lovable.app"
TARGET = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:8080"


class HeadParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_head = False
        self.capture = None
        self.buffer = ""
        self.titles = []
        self.meta = {}
        self.canonicals = []
        self.schemas = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "head":
            self.in_head = True
        if not self.in_head:
            return
        if tag == "meta":
            key = attrs.get("property") or attrs.get("name")
            if key:
                self.meta.setdefault(key, []).append(attrs.get("content", ""))
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonicals.append(attrs.get("href", ""))
        if tag == "title" or (tag == "script" and attrs.get("type") == "application/ld+json"):
            self.capture = tag
            self.buffer = ""

    def handle_data(self, data):
        if self.capture:
            self.buffer += data

    def handle_endtag(self, tag):
        if tag == self.capture:
            (self.titles if tag == "title" else self.schemas).append(self.buffer.strip())
            self.capture = None
        if tag == "head":
            self.in_head = False


def validate_schema(raw, expected):
    document = json.loads(raw)
    documents = document if isinstance(document, list) else [document]
    for item in documents:
        assert isinstance(item, dict), "JSON-LD must contain objects"
        assert item.get("@context") == "https://schema.org", "Invalid schema context"
        nodes = item.get("@graph", [item])
        assert isinstance(nodes, list) and nodes, "Empty schema graph"
        for node in nodes:
            kind = node.get("@type")
            assert kind in {"Organization", "WebSite", "WebPage"}, f"Unsupported or misleading schema: {kind}"
            assert isinstance(node.get("name"), str) and node["name"].strip(), "Missing schema name"
            assert node.get("url") == (ORIGIN + "/" if kind in {"Organization", "WebSite"} else expected), "Schema URL mismatch"
            if kind == "Organization":
                assert node.get("logo") == ORIGIN + "/learnote-mark.png", "Incorrect logo URL"
            else:
                assert node.get("inLanguage") == "fr", "Incorrect schema language"
            if kind == "WebPage":
                assert node.get("description", "").strip(), "Missing page schema description"


def main():
    routes = []
    for file in Path("src/routes").rglob("*.ts*"):
        source = file.read_text()
        match = re.search(r'createFileRoute\(["\']([^"\']+)["\']\)', source)
        if match and "head:" in source and "component:" in source:
            routes.append(match.group(1))
    assert routes, "No public pages discovered"
    failures = []
    seen_titles = set()
    seen_descriptions = set()
    for route in sorted(routes):
        try:
            with urlopen(TARGET + route, timeout=45) as response:
                assert response.status == 200, f"HTTP {response.status}"
                parser = HeadParser()
                parser.feed(response.read().decode())
            expected = ORIGIN + route
            assert len(parser.titles) == 1 and parser.titles[0], "Missing or duplicate title"
            assert parser.titles[0] not in seen_titles, "Non-unique title"
            seen_titles.add(parser.titles[0])
            for key in ["description", "og:url", "og:title", "og:description", "og:type", "twitter:card", "twitter:title", "twitter:description"]:
                values = parser.meta.get(key, [])
                assert len(values) == 1 and values[0].strip(), f"Missing, empty or duplicate {key}"
            description = parser.meta["description"][0]
            assert description not in seen_descriptions, "Non-unique description"
            seen_descriptions.add(description)
            assert parser.meta["og:url"] == [expected], "og:url is not self-referencing"
            assert parser.canonicals == [expected], "Missing, duplicate or wrong canonical"
            assert parser.meta["og:type"] == ["website"], "Study tools must not claim to be articles"
            assert parser.meta["twitter:card"][0] in {"summary", "summary_large_image"}, "Invalid Twitter card"
            assert parser.meta["twitter:title"] == parser.meta["og:title"], "Twitter/OG title mismatch"
            assert parser.meta["twitter:description"] == parser.meta["og:description"], "Twitter/OG description mismatch"
            assert parser.schemas, "No JSON-LD"
            for schema in parser.schemas:
                validate_schema(schema, expected)
            print(f"PASS {route}: Open Graph + JSON-LD ({len(parser.schemas)} blocks)")
        except Exception as error:
            failures.append((route, str(error)))
            print(f"FAIL {route}: {error}")
    try:
        with urlopen(TARGET + "/learnote-mark.png", timeout=45) as response:
            assert response.status == 200 and response.headers.get("Content-Type", "").startswith("image/"), "Logo is not a crawlable image"
    except Exception as error:
        failures.append(("logo", str(error)))
    print(f"\n{len(routes)} public pages checked; {len(failures)} failures.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())