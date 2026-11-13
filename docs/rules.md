# Rules

Every rule has a stable id (part of the public contract) and a default severity:
`error` fails the run, `warn` is reported but only fails with `--strict`, `off` is not
reported. Change a severity in the config file:

```json
{ "rules": { "redirect-to-homepage": "error", "chain-too-long": "off" } }
```

or for part of the site only:

```json
{ "overrides": [{ "match": "/blog/**", "rules": { "canonical-mismatch": "warn" } }] }
```

Entry status is `fail` if any issue is at `error` level, otherwise `warn` if any issue is
at `warn` level, otherwise `ok`.

| Rule | Default |
|---|---|
| [request-failed](#request-failed) | error |
| [redirect-loop](#redirect-loop) | error |
| [too-many-redirects](#too-many-redirects) | error |
| [no-redirect](#no-redirect) | error |
| [wrong-destination](#wrong-destination) | error |
| [status-not-permanent](#status-not-permanent) | error |
| [unexpected-status](#unexpected-status) | error |
| [target-not-ok](#target-not-ok) | error |
| [target-noindex](#target-noindex) | error |
| [canonical-mismatch](#canonical-mismatch) | error |
| [robots-blocked](#robots-blocked) | error |
| [robots-unreachable](#robots-unreachable) | warn |
| [chain-too-long](#chain-too-long) | warn |
| [trailing-slash-hop](#trailing-slash-hop) | warn |
| [redirect-to-homepage](#redirect-to-homepage) | warn |
| [redirect-collapse](#redirect-collapse) | warn |
| [query-dropped](#query-dropped) | warn |
| [protocol-inconsistent](#protocol-inconsistent) | warn |
| [host-inconsistent](#host-inconsistent) | warn |
| [location-relative](#location-relative) | off |
| [sitemap-url-redirects](#sitemap-url-redirects) | error |
| [sitemap-url-not-indexable](#sitemap-url-not-indexable) | error |
| [orphan-url](#orphan-url) | error |

---

## request-failed

**Fires when** a request fails with a DNS, TLS, connection or timeout error after all retries
(`--retries`, default 2). The hop records the error code, for example `ENOTFOUND`,
`ECONNRESET`, `ETIMEDOUT` or `CERT_HAS_EXPIRED`.

**Why it matters.** A crawler that cannot reach the URL cannot follow the redirect either.

**How to fix.** Check DNS and certificates for the host. If the server is just slow, raise
`--timeout`. If a firewall blocks the runner, allowlist it (see
[limitations](limitations.md)).

**Disable.** `"request-failed": "warn"` (not recommended).

## redirect-loop

**Fires when** a URL (after normalization) appears twice in the chain.

**Why it matters.** Browsers and crawlers give up; the old URL is effectively dead.

**How to fix.** Look at the chain in the report and remove the rule that sends a later URL
back to an earlier one. Common causes: conflicting trailing-slash rules, or an http/https
rule fighting a CDN setting.

**Disable.** Not recommended.

## too-many-redirects

**Fires when** the chain is longer than `maxRedirects` (default 10) and the tool stops.

**Why it matters.** Googlebot follows a limited number of hops; browsers stop at around 20.

**How to fix.** Point the old URL directly at its final destination.

**Disable.** Raise `--max-redirects` if you really have long chains to inspect.

## no-redirect

**Fires when** the map expects a redirect but the old URL answers `2xx` directly.

**Why it matters.** The old page is still served (often an old template or a catch-all
route), so the new page does not inherit its signals, and you may now have duplicate content.

**How to fix.** Add the redirect, or, if the URL is meant to stay, declare it in the map with
an empty `to` and status `200`.

**Disable.** `"no-redirect": "off"`.

## wrong-destination

**Fires when** the normalized final URL differs from the normalized expected `to`. The
message says when the difference is only the trailing slash, only the query string, only the
protocol or only the host.

**Why it matters.** Signals flow to the page the redirect actually reaches. A redirect to the
wrong page can rank the wrong content or none at all.

**How to fix.** Point the redirect for the old URL directly at the expected target. If the
difference is only a trailing slash and that is intended, set `"ignoreTrailingSlash": true`;
for query strings, `"ignoreQuery": true`.

**Disable.** `"wrong-destination": "warn"`.

## status-not-permanent

**Fires when** any redirect hop uses a status that is not accepted for the entry: the
`status` column of the row, or `expectStatus` (default `301` and `308`). The message names
the first offending hop; `details.hops` lists all of them.

**Why it matters.** A permanent redirect (301/308) tells search engines the move is final.
Temporary redirects (302/307) may keep the old URL indexed for longer. A temporary hop hidden
in the middle of a chain is a common leftover of a CMS or CDN rule.

**How to fix.** Use 301 or 308 on every hop. If a temporary redirect is intended, put
`temporary` (or `302`) in the row's status column.

**Disable.** `--expect-status 301,302,307,308`, or `"status-not-permanent": "off"`.

## unexpected-status

**Fires when** a row declares a page as removed (empty `to` with `404` or `410`) or as kept
(empty `to` with `200`) and the URL answers something else.

**Why it matters.** "Gone" should really be gone (a `410` is the clearest signal), and a page
you meant to keep should not redirect.

**How to fix.** Make the server return the declared status, or correct the map.

**Disable.** `"unexpected-status": "off"`.

## target-not-ok

**Fires when** the final response is not `200`: a `4xx`, a `5xx`, or a `3xx` without a usable
`Location`. In redirect mode, an old URL that answers `404` without any redirect is also
reported here ("no redirect").

**Why it matters.** A redirect to a broken page passes nothing on. A missing redirect is the
most common migration bug.

**How to fix.** Add the missing redirect, or fix the destination page.

**Disable.** Not recommended.

## target-noindex

**Fires when** the final page carries `noindex` or `none` in:

- the `X-Robots-Tag` header, globally or prefixed with the robots agent
  (`X-Robots-Tag: googlebot: noindex`);
- `<meta name="robots">` or `<meta name="googlebot">` (more precisely, a meta tag named after
  `robotsAgent`).

**Why it matters.** The redirect works but the destination asks not to be indexed. Staging
sites often ship with a global `noindex` that survives launch.

**How to fix.** Remove `noindex` from the destination before launch.

**Disable.** `--no-indexability` skips all destination checks; `"target-noindex": "warn"`
keeps the report without failing.

## canonical-mismatch

**Fires when** the canonical of the final page (from the `Link: <...>; rel="canonical"`
header, which wins, or the first `<link rel="canonical">` in the HTML head) resolves to a URL
that is neither the final URL nor the expected `to`.

**Why it matters.** Search engines may index the canonical target instead of the page your
redirect points to.

**How to fix.** Make the canonical self-referencing. With host rewrites, note that a staging
site whose canonical points to production is fine: production URLs are what redirect-guard
compares against.

**Disable.** `"canonical-mismatch": "warn"`, or per section with `overrides`.

## robots-blocked

**Fires when** the final URL is disallowed by the `robots.txt` of its origin for
`robotsAgent` (default `googlebot`, falling back to the `*` group). Matching follows RFC 9309:
longest match wins, `Allow` wins ties, `*` and `$` are supported, and paths are compared in
percent-encoded form. With `--host-rewrite`, robots.txt is read from the server under test.

**Why it matters.** A crawler cannot fetch the destination, so the redirect leads nowhere
useful. A `Disallow: /` copied from staging is a classic launch-day mistake.

**How to fix.** Allow the path in robots.txt, or redirect to a crawlable page.

**Disable.** `--no-robots`, or `"robots-blocked": "warn"`.

## robots-unreachable

**Fires when** `robots.txt` answers `5xx` or `429`, or cannot be fetched. Per RFC 9309,
crawlers may then treat the whole site as disallowed. The URL is not marked as blocked; the
rule warns instead.

**How to fix.** Make `/robots.txt` answer `200` (or `404` if you have none).

**Disable.** `"robots-unreachable": "off"`.

## chain-too-long

**Fires when** there are more redirect hops than `maxHops` (default 1).

**Why it matters.** Every hop costs crawl budget and latency, and long chains are fragile:
one broken link in the middle breaks the whole path.

**How to fix.** Redirect the old URL straight to the final URL.

**Disable.** `--max-hops 2`, or `"chain-too-long": "off"`.

## trailing-slash-hop

**Fires when** a hop only adds or removes a trailing slash, typically a framework or server
normalising after your migration redirect (`/a` to `/b` to `/b/`).

**How to fix.** Make the migration redirect point at the canonical form (`/b/`) so the extra
hop disappears.

**Disable.** `"trailing-slash-hop": "off"`.

## redirect-to-homepage

**Fires when** an old URL with a non-root path ends at the root `/` of an origin and the
expected `to` is not `/`.

**Why it matters.** Google may treat irrelevant redirects to the homepage as soft 404s, so
the old page's signals can be lost.

**How to fix.** Redirect to the closest equivalent page, or return `410` if there is none.

**Disable.** `"redirect-to-homepage": "off"`.

## redirect-collapse

**Fires when** at least `collapseThreshold` (default 10) distinct old URLs end at the same
final URL. It is reported once per target as a group and attached to every entry involved.

**Why it matters.** Many unrelated pages consolidated into one may be treated as soft 404s.
Consolidating genuinely similar pages (for example tag archives into one category) can be
fine; raise the threshold or disable the rule in that case.

**How to fix.** Map old pages to their closest equivalents, or return `410` for content that
no longer exists.

**Disable.** `"collapseThreshold": 50`, or `"redirect-collapse": "off"`.

## query-dropped

**Fires when** the old URL had a query string and the final URL has none. Only in sitemap/text
mode (no expected target) or when `"preserveQuery": true`.

**Why it matters.** Query strings sometimes identify content (`/product.php?id=42`); dropping
them sends every product to the same page.

**How to fix.** Map parameterised URLs one by one, or make the server keep the query string.

**Disable.** `"query-dropped": "off"`.

## protocol-inconsistent

**Fires when** the final URL is `http:` while `base` (or, without a base, most final URLs) is
`https:`.

**How to fix.** Redirect to the `https:` URL directly.

**Disable.** `"protocol-inconsistent": "off"`.

## host-inconsistent

**Fires when** the final host differs from the `base` host (or the majority host) only by
`www.`.

**How to fix.** Pick one host and redirect to it directly.

**Disable.** `"host-inconsistent": "off"`.

## location-relative

**Fires when** a `Location` header is relative (`Location: /new`). This is legal per
RFC 9110 and Google follows it, so the rule is **off** by default and informational only.

**Enable.** `"location-relative": "warn"`.

## sitemap-url-redirects

`diff` only. **Fires when** a URL listed in the new sitemap answers with a redirect.

**Why it matters.** Sitemaps should list final, canonical URLs. Listing redirecting URLs
sends mixed signals and wastes crawl budget.

**How to fix.** List the final URL in the sitemap instead.

## sitemap-url-not-indexable

`diff` only. **Fires when** a URL listed in the new sitemap does not answer `200`, carries
`noindex`, or is blocked by robots.txt.

**How to fix.** Fix the page, or remove it from the sitemap.

## orphan-url

`diff` only. **Fires when** an old sitemap URL is not in the new sitemap, is not redirected
to a page that answers `200`, and does not answer `200` itself.

**Why it matters.** These are the URLs that silently turn into 404s after a relaunch.

**How to fix.** Add a redirect to the replacement page, or return `410` on purpose and add
the URL to your redirect map with status `410`.
