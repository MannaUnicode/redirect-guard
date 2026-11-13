# Security policy

## Supported versions

Security fixes are released for the latest minor version on npm.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub private vulnerability reporting:
[Report a vulnerability](https://github.com/OWNER/redirect-guard/security/advisories/new).
You will get an answer within a few days, and a fix or mitigation plan as soon as the issue
is confirmed. Credit is given in the advisory unless you prefer otherwise.

## What redirect-guard does on the network

- It requests only the URLs you supply (map, sitemap, `--base`), the redirects they lead to,
  and the `robots.txt` of each destination origin. It never crawls links from pages.
- Custom headers (`--header`, `headers` in config) and Basic auth (`--auth-env`) are sent
  only to in-scope origins: the `base` origin, the targets of `hostRewrite` and the origins
  of the URLs in your map. A redirect to any other origin is requested without them.
- Header values never appear in reports or error messages; the JSON report shows them as
  `"***"`. A missing `$env:` variable is reported by name, never by value.
- Response bodies are read only for the final HTML page (capped at 512 KB by default),
  for `robots.txt` and for sitemaps.
- `redirect-guard.config.mjs` is executed as JavaScript, like other `.mjs` config files.
  Only use config files you trust. JSON config files are never executed.

### Server-side request forgery (SSRF)

If you run redirect-guard as a service that accepts maps from untrusted users, those users
can make your server request arbitrary URLs, including internal addresses, and follow
redirects to them. redirect-guard does not block private networks by design (testing
`localhost` and staging hosts is a core use case). Run such services in an isolated network
or put an allowlisting proxy in front via the `fetch` option of the API.

## No telemetry

redirect-guard sends no analytics, crash reports or usage data anywhere.
