# Programmatic API

```js
import { check, diffSitemaps, exitCodeFor, formatReport } from 'redirect-guard';
```

ESM only, Node.js 20.3 or later, typed through `types/index.d.ts`. The library never writes
to stdout or stderr and never sets `process.exitCode`; all of that lives in the CLI.

## check(options)

```js
const report = await check({
  map: 'redirects.csv',              // or sitemap: 'old-sitemap.xml', or entries: [...]
  base: 'https://www.example.com',
  hostRewrite: { 'https://www.example.com': 'https://staging.example.com' },
  headers: { Authorization: `Basic ${process.env.STAGING_AUTH_B64}` },
  maxHops: 1,
  rules: { 'redirect-to-homepage': 'error' },
  onProgress: (done, total) => {},
  signal: AbortSignal.timeout(120_000),
});
```

Options are the config keys from [configuration.md](configuration.md) plus:

| Option | Meaning |
|---|---|
| `entries` | Check these rows instead of loading a file: `{ from, to?, status?, source? }`. |
| `fetch` | A `fetch` implementation (tests, proxies, custom agents). Must support `redirect: 'manual'` and expose the real 3xx response, like Node's built-in fetch. |
| `signal` | `AbortSignal` that cancels the run. |
| `onProgress` | `(done, total, { fail, active }) => void`. |
| `cwd` | Base directory for relative `map`/`sitemap` paths. |

The returned report has the same shape as `--json` output (`schemaVersion: 1`, see
[schema/report.schema.json](../schema/report.schema.json)).

```js
for (const r of report.results) {
  if (r.status === 'fail') console.log(r.from, r.issues.map((i) => i.rule));
}
process.exitCode = exitCodeFor(report, 'error'); // 0 or 1
```

Errors are thrown as `UsageError`, `ConfigError` or `InputError`, each with a stable `code`
(`ERR_USAGE`, `ERR_CONFIG`, `ERR_INPUT`) and optional `hint` and `frame`. Per-URL network
errors are not thrown; they appear as `request-failed` issues.

## diffSitemaps(options)

```js
const report = await diffSitemaps({ old: 'old.xml', new: 'https://www.example.com/sitemap.xml', offline: false });
console.log(report.diff); // { kept, removed, added, removedUrls, addedUrls }
```

## Lower-level helpers

| Function | Purpose |
|---|---|
| `loadMap(pathOrSpec, { base })` | Parse a CSV/TSV/JSON/TXT map (or `{ text, format }`) into entries. |
| `loadSitemap(src, opts)` | All `<loc>` URLs of a sitemap or index, local or remote, `.gz` allowed. |
| `traceRedirects(url, opts)` | Follow one URL hop by hop; returns `{ chain, final, error, loop, tooMany }`. |
| `parseRobots(text)` / `isAllowed(rules, url, agent)` | RFC 9309 robots.txt parsing and matching. |
| `extractHeadSignals(html)` | Meta robots and canonical from an HTML head. |
| `normalizeUrl(url, opts)` | The URL normalization used for comparisons. |
| `formatReport(report, format, opts)` | Render `text`, `json`, `markdown`, `junit` or `github`. |
| `defineConfig(config)` | Identity helper for typed `.mjs` config files. |
| `RULES` | Frozen registry: severity, description, hint, docs URL for each rule id. |
| `version` | Package version. |
