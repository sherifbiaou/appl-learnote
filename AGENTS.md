# Project rules
- Public content routes own their canonical and page-specific social metadata; never put a canonical in the root head because links concatenate.
- Generated study tools use WebPage structured data, not Article, because browser-local personal output is not a published article.
- Run `python3 scripts/validate-seo.py` against the running app after metadata changes; it discovers public content routes and validates server-rendered head tags without browser storage.