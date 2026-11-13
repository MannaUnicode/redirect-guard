# Using redirect-guard in CI

redirect-guard exits `1` when something fails and `2` on usage or input errors, so any CI
system can use it as a gate. These examples use GitHub Actions; a copy-paste workflow is in
[examples/github-actions.yml](../examples/github-actions.yml).

## Before launch: test the production map against a preview or staging host

```yaml
- name: Check redirects against the preview
  env:
    STAGING_AUTH: ${{ secrets.STAGING_AUTH }}   # "user:pass"; drop --auth-env if the preview is public
  run: >
    npx redirect-guard@0 redirects.csv
    --host-rewrite https://www.example.com=${{ env.PREVIEW_URL }}
    --auth-env STAGING_AUTH
    --reporter text --reporter markdown:rg.md --reporter junit:rg.xml
```

Only one reporter can write to stdout; give every other reporter a file
(`--reporter junit:rg.xml`). Two reporters on stdout is a usage error (exit 2).

With `--host-rewrite`, the map can keep production URLs: requests go to the preview, and
the report shows production URLs. The Basic auth header is sent only to the preview and the
origins in your map.

## After launch: keep it as a regression test

```yaml
on:
  schedule:
    - cron: '0 6 * * 1'   # every Monday
  workflow_dispatch:
jobs:
  redirects:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 22 }
      - run: npx redirect-guard@0 redirects.csv --base https://www.example.com
```

## Step summary and sticky PR comments

The Markdown reporter starts with a fixed marker line, `<!-- redirect-guard-report -->`.

```yaml
- name: Summary
  if: always()
  run: cat rg.md >> "$GITHUB_STEP_SUMMARY"
```

To keep one comment per PR updated instead of posting a new one on every push, search the
PR's comments for the marker and edit that comment (for example with `gh api` or an action
such as a sticky-comment action), and create it only if it does not exist.

Output is capped at about 60 000 characters with a truncation note, below GitHub's comment
limit. Use the JSON reporter for complete data.

## Annotations on the CSV line

The `github` reporter prints workflow commands:

```
::error file=redirects.csv,line=13,title=wrong-destination::/chi-siamo Ends at /about, expected /team
```

GitHub shows them on the line of the map in the PR diff. At most 50 annotations per level are
printed, followed by a notice with the remaining count. Use it as the stdout reporter:

```yaml
- run: npx redirect-guard@0 redirects.csv --base "$PREVIEW_URL" --reporter github --reporter text:rg.txt
```

It is never enabled automatically.

## JUnit

`--reporter junit:rg.xml` writes one test case per entry. Errors are `<failure>` elements
with the chain in the body; warnings go to `<system-out>` (or become failures with
`--strict`). Upload it as an artifact or feed it to a test report action.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Nothing at or above the `--fail-on` level. |
| `1` | At least one entry failed (or had a warning with `--strict`). |
| `2` | Usage, config or input error, including an unreachable sitemap URL. |

## Polite crawling

The defaults (4 parallel requests, 2 retries with backoff, `Retry-After` honoured) suit most
sites. For fragile servers add `--concurrency 2 --delay 250`. For sites behind bot protection,
allowlist the runner's IP or user agent (`--user-agent`) on staging.
