import { version } from '../version.js';

export function mainHelp() {
  return `redirect-guard ${version}
Check a redirect map or an old sitemap against the live site.

Usage
  redirect-guard [check] <map> [options]
  redirect-guard [check] --sitemap <url|file> [--base <origin>] [options]
  redirect-guard diff --old <src> --new <src> [options]

Examples
  redirect-guard redirects.csv --base https://www.example.com
  redirect-guard --sitemap old-sitemap.xml --base https://new.example.com
  redirect-guard redirects.csv \\
    --host-rewrite https://www.example.com=https://staging.example.com \\
    --auth-env STAGING_AUTH
  redirect-guard redirects.csv --reporter text --reporter junit:reports/rg.xml --strict

Input
  <map>                     CSV, TSV, JSON or TXT file, or - for stdin
  --sitemap <src>           Old sitemap (URL or file; .xml or .xml.gz; index allowed)
  --base <origin>           New site origin. Relative paths resolve against it
  --include <glob>          Only check matching paths (repeatable)
  --exclude <glob>          Skip matching paths (repeatable)
  --limit <n>               Only check the first n entries

Expectations
  --expect-status <list>    Accepted redirect codes (default 301,308)
  --max-hops <n>            Hops allowed before chain-too-long (default 1)
  --max-redirects <n>       Hard stop (default 10)
  --no-indexability         Skip noindex, canonical and robots.txt checks
  --no-robots               Skip only the robots.txt check
  --robots-agent <token>    robots.txt group to evaluate (default googlebot)

Network
  --host-rewrite <a=b>      Send requests for origin a to origin b (repeatable)
  --header "<K: V>"         Extra header for in-scope origins only (repeatable)
  --auth-env <NAME>         Env var with user:pass, sent as Basic auth (in scope only)
  --concurrency <n>         Parallel requests, 1-32 (default 4)
  --delay <ms>              Minimum gap per origin (default 0)
  --timeout <ms>            Per request (default 15000)
  --retries <n>             On 429, 503 and network errors, 0-5 (default 2)
  --user-agent <s>          Custom User-Agent

Output
  --reporter <name[:file]>  text, json, markdown, junit, github (repeatable)
  --json | --markdown | --junit
                            Shorthand for --reporter <name> to stdout
  --strict                  Warnings also fail (same as --fail-on warn)
  --fail-on <level>         error (default) or warn
  --verbose                 Show passing entries, timings and hop details
  --quiet                   Only failures and the summary
  --no-color                Disable colors (NO_COLOR and FORCE_COLOR are honored)

Config
  --config <path>           Config file (default: ./redirect-guard.config.json)
  --no-config               Ignore config files

Exit codes
  0 no failures · 1 failures found · 2 usage, config or input error

Docs: https://github.com/OWNER/redirect-guard#readme
`;
}

export function diffHelp() {
  return `redirect-guard ${version}
Compare an old and a new sitemap.

Usage
  redirect-guard diff --old <src> --new <src> [options]

  Old URLs are mapped onto the new origin (--base, or the new sitemap's origin).
  Removed URLs must redirect to an indexable page (orphan-url otherwise).
  URLs in the new sitemap must answer 200 directly (sitemap-url-redirects,
  sitemap-url-not-indexable).

Options
  --old <src>               Old sitemap (URL or file)
  --new <src>               New sitemap (URL or file)
  --base <origin>           Origin to check old URLs on (default: new sitemap origin)
  --offline                 Only compute the set diff, no HTTP requests

  All network and output options of "check" apply. Run "redirect-guard --help".
`;
}
