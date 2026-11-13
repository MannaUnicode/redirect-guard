# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). During `0.x`, breaking changes ship in minor
releases and are always listed under "Breaking".

## [Unreleased]

## [0.1.0] - unreleased

First public release.

### Added

- `check` command: CSV/TSV (delimiter auto-detect, BOM, quotes, `#` comments), JSON, text
  and stdin maps; old sitemap input (`--sitemap`, urlset and index up to depth 3, `.xml.gz`).
- Manual hop-by-hop tracing with `GET` and `redirect: 'manual'`, retries on 429/503 and
  transient network errors with `Retry-After` support, global concurrency and per-origin delay.
- 23 rules with stable ids: redirect status and destination, loops and chains,
  removed (`410`/`404`) and kept (`200`) pages, final-page indexability (status,
  `X-Robots-Tag`, meta robots, canonical from `Link` header or HTML, RFC 9309 `robots.txt`),
  migration heuristics (homepage redirects, collapse onto one page, dropped query strings,
  protocol and host consistency) and sitemap diff rules.
- `diff` command comparing old and new sitemaps, with `--offline` set-only mode.
- `--host-rewrite` to test a production map against staging, with header and Basic auth
  scoping to in-scope origins.
- Reporters: `text` (colors and Unicode auto-detected, `NO_COLOR`/`FORCE_COLOR` honoured),
  `json` (`schemaVersion: 1`, `schema/report.schema.json`), `markdown`, `junit`, `github`.
- Config file (`redirect-guard.config.json` or `.mjs`) with `rules`, `overrides`,
  `include`/`exclude`, `$env:` expansion and a JSON Schema for editor completion.
- Typed programmatic API (`check`, `diffSitemaps`, `traceRedirects`, `parseRobots`, ...).
- Exit codes: `0` ok, `1` failures (or warnings with `--strict`), `2` usage/config/input error.
