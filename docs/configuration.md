# Configuration

redirect-guard reads options from three layers, later layers win:

1. built-in defaults (`src/config/defaults.js`);
2. a config file;
3. CLI flags.

Repeatable list flags (`--include`, `--exclude`) are **appended** to the config arrays.
`--header` values are merged into `headers`, `--host-rewrite` into `hostRewrite`.
Reporters are the exception: any `--reporter`, `--json`, `--markdown` or `--junit` flag
**replaces** the config's `reporters` (and the default `text`).

## Config file discovery

`--config <path>`, or else the first of these in the current directory (there is no upward
search):

- `redirect-guard.config.json` (recommended)
- `redirect-guard.config.mjs` (executed with `import()`, like other JavaScript config files)

`--no-config` disables discovery. `map` and `sitemap` paths in a config file are relative to
the file.

```js
// redirect-guard.config.mjs
import { defineConfig } from 'redirect-guard';

export default defineConfig({
  base: 'https://www.example.com',
  map: 'redirects.csv',
});
```

## Options

| Key | CLI flag | Default | Meaning |
|---|---|---|---|
| `base` | `--base <origin>` | `null` | New site origin. Relative paths resolve against it. In sitemap mode, the old URL's origin is replaced with it. |
| `map` | positional `<map>` | `null` | CSV, TSV, JSON or TXT map. `-` reads stdin (CLI only). |
| `sitemap` | `--sitemap <src>` | `null` | Old sitemap URL or file (`.xml`, `.xml.gz`, index allowed). |
| `hostRewrite` | `--host-rewrite a=b` | `{}` | Send requests for origin `a` to origin `b`. |
| `expectStatus` | `--expect-status 301,308` | `[301, 308]` | Accepted redirect statuses when a row has no status. |
| `maxHops` | `--max-hops <n>` | `1` | Redirect hops allowed before `chain-too-long`. |
| `maxRedirects` | `--max-redirects <n>` | `10` | Hard stop (`too-many-redirects`). |
| `concurrency` | `--concurrency <n>` | `4` | Parallel requests (1-32). |
| `delay` | `--delay <ms>` | `0` | Minimum gap between requests to the same origin. |
| `timeout` | `--timeout <ms>` | `15000` | Per request. |
| `retries` | `--retries <n>` | `2` | Retries on 429, 503 and transient network errors (0-5). |
| `userAgent` | `--user-agent <s>` | `redirect-guard/<version> (+https://github.com/MannaUnicode/redirect-guard)` | |
| `headers` | `--header "K: V"` | `{}` | Extra headers, sent only to in-scope origins. |
| (none) | `--auth-env <NAME>` | | Env var holding `user:pass`, sent as Basic auth to in-scope origins. |
| `robotsAgent` | `--robots-agent <token>` | `googlebot` | robots.txt group and meta tag name to evaluate. |
| `indexability` | `--no-indexability` | `true` | Read the final page and check noindex, canonical and robots.txt. |
| `robots` | `--no-robots` | `true` | Check robots.txt only. |
| `ignoreTrailingSlash` | | `false` | Treat `/a` and `/a/` as the same URL when comparing. |
| `ignoreQuery` | | `false` | Ignore query strings when comparing. |
| `preserveQuery` | | `false` | Enable `query-dropped` for rows with an expected target. |
| `collapseThreshold` | | `10` | Old URLs ending at one page before `redirect-collapse`. |
| `include` | `--include <glob>` | `[]` | Only check matching `from` paths (pathname + query). |
| `exclude` | `--exclude <glob>` | `[]` | Skip matching `from` paths. |
| `limit` | `--limit <n>` | `null` | Only check the first n entries. |
| `failOn` | `--fail-on`, `--strict` | `error` | `warn` makes warnings fail too. |
| `rules` | | `{}` | Rule id to `"error"`, `"warn"` or `"off"`. |
| `overrides` | | `[]` | Per-path settings, see below. |
| `reporters` | `--reporter name[:file]` | `["text"]` | `text`, `json`, `markdown`, `junit`, `github`. |
| `maxBodyBytes` | | `524288` | Bytes of the final HTML page read for meta and canonical. |

CLI-only flags: `--verbose`, `--quiet`, `--no-color`, `--config`, `--no-config`, and for
`diff`: `--old`, `--new`, `--offline`.

Invalid values, unknown keys and unknown rule ids exit with code 2 and a suggestion
("did you mean `chain-too-long`?").

## Globs

`include`, `exclude` and `overrides[].match` match the pathname plus query of the old URL:

- `*` matches anything except `/`;
- `**` matches anything, including `/`;
- `?` matches one character except `/`;
- a trailing `/**` also matches the directory itself (`/blog/**` matches `/blog`).

## Overrides

```json
{
  "overrides": [
    { "match": "/blog/**", "maxHops": 2, "rules": { "canonical-mismatch": "warn" } },
    { "match": "/shop/**", "expectStatus": [301] }
  ]
}
```

Overrides apply in order and later ones win. Allowed keys: `maxHops`, `expectStatus`,
`rules`, `ignoreTrailingSlash`, `ignoreQuery`, `preserveQuery`, `indexability`, `robots`,
`collapseThreshold`.

## Environment variables in config

`$env:NAME` is expanded in `base`, in `headers` values and in `hostRewrite` keys and values:

```json
{ "headers": { "Authorization": "Bearer $env:PREVIEW_TOKEN" } }
```

A missing variable is an error (exit 2) that names the variable and never prints a value.
On the CLI, `--header "X-Token: $env:TOKEN"` works the same way (quote it so the shell does
not expand it).

## Editor completion

Point `$schema` at the published schema, pinned to the major version:

```json
{ "$schema": "https://unpkg.com/redirect-guard@0/schema/config.schema.json" }
```

## Versioning

redirect-guard follows [SemVer](https://semver.org/). The public contract is:

1. CLI command names, flag names and their meaning;
2. exit codes (`0`, `1`, `2`);
3. rule ids, and which rules default to `error`;
4. the JSON report's `schemaVersion` and field names (`schema/report.schema.json`);
5. config keys;
6. the named exports and types of the library.

Text and Markdown output are **not** part of the contract and may change in any release.
New flags, new optional JSON fields, new reporters and new rules that default to `warn` or
`off` are minor changes. Removing or renaming any of the above, raising a default to
`error`, changing an exit code, bumping `schemaVersion` or raising the minimum Node.js
version are major changes. During `0.x`, breaking changes go in minor releases and are
listed under "Breaking" in the changelog.
