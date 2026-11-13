<p align="center">
  <img src="docs/assets/logo.svg" width="88" height="88" alt="">
</p>

<h1 align="center">redirect-guard</h1>

<p align="center">
  Test your site migration before Google does.<br>
  Check a redirect map or an old sitemap against the live site and catch broken 301s,
  chains, loops and redirect targets that can't be indexed. From the CLI or in CI.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/redirect-guard"><img src="https://img.shields.io/npm/v/redirect-guard?color=0f766e" alt="npm"></a>
  <a href="https://github.com/MannaUnicode/redirect-guard/actions/workflows/ci.yml"><img src="https://github.com/MannaUnicode/redirect-guard/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="package.json"><img src="https://img.shields.io/node/v/redirect-guard" alt="node"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/dependencies-0-0f766e" alt="dependencies: 0"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/redirect-guard" alt="license: MIT"></a>
</p>

Italiano: [README.it.md](README.it.md)

---

When a site is rebuilt or moves domain, old URLs break quietly. A missing redirect, a 302
where a 301 belongs, a chain of three hops, or a redirect that lands on a `noindex` page.
The damage shows up weeks later in Search Console. redirect-guard checks every old URL
before and after launch, and fails your build if something is wrong.

## Quickstart (30 seconds)

```sh
# redirects.csv:  from,to
#                 /chi-siamo,/about
#                 /servizi/seo,/services/seo
npx redirect-guard redirects.csv --base https://www.example.com
```

No map yet? Point it at the sitemap you saved from the old site:

```sh
npx redirect-guard --sitemap old-sitemap.xml --base https://www.example.com
```

Requires Node.js 20.3 or later. No install step and no runtime dependencies.

## What you get

Output of `NO_COLOR=1 npm run demo`, which runs the CLI against a local test server that
imitates a typical migration ([scripts/demo.js](scripts/demo.js)):

<!-- demo:start -->
```
redirect-guard 0.1.0 · 10 URLs from redirects.csv · base https://www.example.com
  testing against http://127.0.0.1:63149 (host rewrite)

 FAIL  /chi-siamo                                                                    redirects.csv:2
         301  /chi-siamo
       → 302  /about/
       → 200  /about
         expected /team
         ✖ wrong-destination     Ends at /about, expected /team
           Point the redirect for /chi-siamo directly at /team.
         ✖ status-not-permanent  Hop 2 returned 302, expected 301 or 308
           Use a permanent redirect (301 or 308) for every hop.
         ▲ chain-too-long        2 hops, limit is 1
         ▲ trailing-slash-hop    Hop 2 only changes the trailing slash

 FAIL  /servizi/seo                                                                  redirects.csv:3
         301  /servizi/seo
       → 200  /services/seo
         ✖ target-noindex  <meta name="robots" content="noindex,follow">
           Remove noindex from /services/seo before launch.

 FAIL  /old-promo                                                                    redirects.csv:5
         200  /old-promo
         ✖ unexpected-status  Expected 410 (gone), got 200
           Make /old-promo answer with the status declared in the map.

 WARN  /blog/2019/nuovo-sito/                                                        redirects.csv:7
         301  /blog/2019/nuovo-sito/  → 301 /blog/nuovo-sito  → 200 /blog/nuovo-sito/
         ▲ chain-too-long      2 hops, limit is 1
         ▲ trailing-slash-hop  Hop 2 only changes the trailing slash

 WARN  4 URLs end at /                                                             redirect-collapse
         /blog/old-post, /shop/categoria-a, /p/123, /tag/seo
         Old pages redirected to the homepage may be treated as soft 404s.

──────────────────────────────────────────────────────────────────────────────
 10 checked · 2 ok · 5 warn · 3 fail · 0.0s

 Top issues
   redirect-collapse        4  warn
   chain-too-long           2  warn
   trailing-slash-hop       2  warn
   status-not-permanent     1  error
   target-noindex           1  error
   unexpected-status        1  error
   wrong-destination        1  error

 ✖ 3 entries failed. Exit code 1.
 Rule docs: https://github.com/MannaUnicode/redirect-guard/blob/main/docs/rules.md
```
<!-- demo:end -->

Exit code `0` means no failures, `1` means failures were found and `2` means a usage, config
or input error, so it can gate a deploy. Warnings do not fail the run unless you pass
`--strict`.

## What it checks

| Area | Rules |
|---|---|
| Redirects | `no-redirect`, `status-not-permanent`, `wrong-destination`, `redirect-loop`, `too-many-redirects`, `chain-too-long`, `trailing-slash-hop` |
| Destination | `target-not-ok`, `target-noindex`, `canonical-mismatch`, `robots-blocked`, `robots-unreachable`, `unexpected-status` (for pages removed on purpose) |
| Migration | `redirect-to-homepage`, `redirect-collapse`, `query-dropped`, `protocol-inconsistent`, `host-inconsistent`, `location-relative` (off by default) |
| Sitemap diff | `orphan-url`, `sitemap-url-redirects`, `sitemap-url-not-indexable` |
| Network | `request-failed` (DNS, TLS, timeouts after retries) |

Every redirect is followed by hand (`GET` with `redirect: 'manual'`), so the whole chain is
recorded: status, `Location`, timing and retries. The final page is then checked for a 200
status, `noindex` in `X-Robots-Tag` or `<meta name="robots">`, a canonical that points
elsewhere, and a `Disallow` in the destination's `robots.txt` (RFC 9309 matching, with
wildcards and `$`).

Each rule has a short section explaining why it matters, how to fix it and how to turn it
off: [docs/rules.md](docs/rules.md).

## Inputs

- **CSV / TSV**: `from,to[,status]`. The header row is optional. `,` `;` and tab delimiters
  are detected, quotes and a UTF-8 BOM are handled. Header aliases such as
  `source,target` or `old_url,new_url` work in any column order.
- **Removed or kept pages**: leave `to` empty and set `410` (or `404`) for pages you removed
  on purpose; set `200` for URLs that must keep answering directly.
- **JSON**: `[{"from": "/a", "to": "/b", "status": 301}]` or `{"/a": "/b"}`.
- **Text**: one URL per line, for example a Search Console export.
- **Old sitemap**: `--sitemap <url|file>`, sitemap index and `.xml.gz` supported. With
  `--base`, each old URL is checked on the new origin (path and query kept). Without it,
  URLs are checked on their own host.
- **stdin**: `-` reads a map from standard input.

Relative paths resolve against `--base`. Absolute URLs work too, for domain moves
(`http://old-domain.it/x,https://www.new-domain.it/y`).

## Test against staging before DNS cutover

```sh
STAGING_AUTH="user:pass" npx redirect-guard redirects.csv \
  --host-rewrite https://www.example.com=https://staging.example.com \
  --auth-env STAGING_AUTH
```

Requests for `https://www.example.com` go to staging, and `Location` headers that point at
staging are mapped back, so reports keep showing your production URLs. Credentials and
custom headers go **only** to the origins you are testing (the base, the rewrite targets and
the origins in your map). A redirect to a CDN or third-party domain never receives them, and
header values never appear in reports.

## Compare old and new sitemaps

```sh
npx redirect-guard diff --old old-sitemap.xml --new https://www.example.com/sitemap.xml
```

Old URLs missing from the new sitemap must redirect to an indexable page (`orphan-url`
otherwise), and every URL in the new sitemap must answer 200 directly
(`sitemap-url-redirects`, `sitemap-url-not-indexable`). `--offline` prints only the set
difference.

## Use in CI

```yaml
- name: Check redirects
  run: >
    npx redirect-guard@0 redirects.csv --base "$PREVIEW_URL"
    --reporter text --reporter markdown:rg.md --reporter junit:rg.xml
- name: Summary
  if: always()
  run: cat rg.md >> "$GITHUB_STEP_SUMMARY"
```

Reporters: `text` (default), `json`, `markdown` (for PR comments and step summaries),
`junit` (for test report UIs) and `github` (workflow annotations placed on the line of the
CSV that failed). Any `--reporter` replaces the default text output, and at most one
reporter may write to stdout. Full workflow, including deploy previews:
[examples/github-actions.yml](examples/github-actions.yml) and [docs/ci.md](docs/ci.md).

## Configuration

`redirect-guard.config.json` in the working directory:

```json
{
  "$schema": "https://unpkg.com/redirect-guard@0/schema/config.schema.json",
  "base": "https://www.example.com",
  "map": "redirects.csv",
  "exclude": ["/wp-admin/**"],
  "rules": { "redirect-to-homepage": "error" },
  "overrides": [{ "match": "/blog/**", "maxHops": 2 }]
}
```

CLI flags override the file. `redirect-guard.config.mjs` is also supported (it runs as code,
like other JavaScript config files). Reference: [docs/configuration.md](docs/configuration.md).

Common flags: `--max-hops`, `--expect-status 301,308`, `--concurrency`, `--delay`,
`--timeout`, `--retries`, `--include`/`--exclude`, `--limit`, `--no-indexability`,
`--robots-agent`. Run `redirect-guard --help` for all of them.

## Programmatic API

```js
import { check, exitCodeFor, formatReport } from 'redirect-guard';

const report = await check({ map: 'redirects.csv', base: 'https://www.example.com' });
console.log(report.summary); // { total, ok, warn, fail, byRule }
console.log(formatReport(report, 'markdown'));
process.exitCode = exitCodeFor(report);
```

Fully typed (`types/index.d.ts`). The library never prints and never sets the exit code.
See [docs/programmatic-api.md](docs/programmatic-api.md).

## Limitations

- It reads raw HTML. A `noindex` or canonical injected by JavaScript is not seen.
- Bot protection (WAFs, challenges) may answer 403 to non-browser clients. Allowlist the
  runner or test against staging. redirect-guard never tries to bypass challenges.
- It tests the URLs you give it. It does not crawl to discover new ones.
- Fragments (`#section`) are never sent to servers, so they cannot be checked.

More: [docs/limitations.md](docs/limitations.md).

## How it compares

Desktop crawlers and hosted QA services are great for exploring a site. redirect-guard is
small, scriptable and made for one job: proving that an old-to-new URL mapping works, on
every deploy. Other redirect checkers on npm compare status codes and `Location` headers.
redirect-guard also follows the whole chain, checks that the final page can actually be
indexed, and looks at the migration as a whole (many URLs collapsing onto one page,
protocol and host consistency, old vs new sitemap).

## Principles

- Zero runtime dependencies, enforced by a test.
- No telemetry, ever.
- Polite by default: 4 parallel requests, optional per-host delay, retries that respect
  `Retry-After`.
- It only requests URLs you supply, plus their redirects and the destination's `robots.txt`.
- Stable contract: rule ids, exit codes, config keys and the JSON report schema follow
  semantic versioning ([docs/configuration.md](docs/configuration.md#versioning)).

## Contributing

`npm ci && npm test`. Tests run against a local server and never touch the network. Read
[CONTRIBUTING.md](CONTRIBUTING.md) before adding a rule.

## License

MIT © 2026 Unicodeit. See [LICENSE](LICENSE).
