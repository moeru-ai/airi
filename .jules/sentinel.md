## 2025-02-17 - [Fix XSS in Provider Definition]
**Vulnerability:** The provider definition troubleshooting content, even when sourced from i18n functions like `t()`, was being directly injected into the DOM using `v-html=""`. This presents an XSS risk.
**Learning:** We must treat all dynamic content injected via `v-html` as potentially untrusted, regardless of its immediate source (even if it's i18n translations), because the definition structures may dynamically include unsanitized data and HTML formatting.
**Prevention:** Always use `DOMPurify.sanitize()` wrapped in a `computed` property when binding to `v-html`, even for provider definitions or translation strings that may appear safe at first glance but actually contain HTML.
