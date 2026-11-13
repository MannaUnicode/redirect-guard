# Limitations

redirect-guard is deliberately small. These are the things it does not do, or cannot know.

## It reads raw HTML

The final page's `<meta name="robots">` and `<link rel="canonical">` are read from the HTML
the server sends. JavaScript is not executed, so a `noindex` or canonical injected on the
client (some single-page app setups) is not seen. Server-rendered and static sites are not
affected. Only the first 512 KB of the page are read (`maxBodyBytes`), which is far more than
any `<head>` needs. Pages are decoded as UTF-8.

## Bot protection and WAFs

Cloudflare, Akamai and similar services may answer `403`, `429` or a challenge page to
non-browser clients. That shows up as `target-not-ok` or `request-failed` and can look like
a broken site. Options:

- run the check against staging or a preview deployment without bot protection;
- allowlist the CI runner's IP, or a custom `--user-agent`, in the WAF;
- lower `--concurrency` and add `--delay`.

redirect-guard never tries to bypass challenges or imitate a browser.

## It checks the URLs you give it

It does not crawl links to discover URLs. Use your old sitemap, a Search Console export or
an analytics export as input so the important URLs are covered.

## Fragments

Browsers never send the `#fragment` part of a URL to the server, so a server cannot lose it
and redirect-guard cannot check it. A fragment in a `Location` header is kept in the report
and ignored for the request.

## Relative Location headers are fine

RFC 9110 allows relative `Location` values and search engines follow them, so
`location-relative` is off by default.

## Soft 404s are a judgement call

`redirect-to-homepage` and `redirect-collapse` flag patterns that Google *may* treat as soft
404s. Whether a consolidation is legitimate depends on the content, so these rules are
warnings.

## Same answer for every client

Requests carry one user agent. Sites that redirect differently by device, country or
language (geo-IP, `Accept-Language`, mobile subdomains) are tested only as the runner sees
them. Add `--header "Accept-Language: it"` if your redirects depend on it.

## Not a full SEO audit

It does not check titles, structured data, hreflang, Core Web Vitals or internal links.
Pair it with a site auditor if you need those.

## Node.js version

Node.js 20.3 or later is required (for `AbortSignal.any`). Node 20 reached end of life in
April 2026; a future major release will require Node 22.
