export const DOCS_URL = 'https://github.com/MannaUnicode/redirect-guard/blob/main/docs/rules.md';

/**
 * @typedef {'error' | 'warn' | 'off'} Severity
 * @typedef {{ severity: Severity, description: string, hint?: string, docsUrl: string, group?: boolean }} RuleInfo
 */

/** @param {Severity} severity @param {string} description @param {string} [hint] */
const rule = (severity, description, hint) => ({ severity, description, ...(hint ? { hint } : {}) });

const DEFS = {
  'request-failed': rule('error', 'DNS, TLS, connection reset or timeout after retries.', 'Check the server, or raise --timeout if the site is slow.'),
  'redirect-loop': rule('error', 'A URL repeats in the redirect chain.', 'Break the loop so {from} ends on a page that answers 200.'),
  'too-many-redirects': rule('error', 'The chain is longer than maxRedirects.', 'Point {from} directly at its final destination.'),
  'no-redirect': rule('error', 'The old URL answers 2xx directly instead of redirecting.', 'Add a redirect from {from} to {to}.'),
  'wrong-destination': rule('error', 'The chain ends somewhere other than the expected target.', 'Point the redirect for {from} directly at {to}.'),
  'status-not-permanent': rule('error', 'A redirect hop uses a status that is not expected (e.g. 302 where 301/308 is expected).', 'Use a permanent redirect (301 or 308) for every hop.'),
  'unexpected-status': rule('error', 'A URL marked as removed (404/410) or kept (200) answers with another status.', 'Make {from} answer with the status declared in the map.'),
  'target-not-ok': rule('error', 'The final response is not 200.', 'Make {final} answer 200, or redirect {from} to a page that exists.'),
  'target-noindex': rule('error', 'The final page carries noindex (X-Robots-Tag or meta robots).', 'Remove noindex from {final} before launch.'),
  'canonical-mismatch': rule('error', 'The canonical of the final page points to a different URL.', 'Make the canonical of {final} point to itself.'),
  'robots-blocked': rule('error', "The final URL is disallowed by the destination's robots.txt.", 'Allow {final} in robots.txt, or redirect to a crawlable page.'),
  'robots-unreachable': rule('warn', 'robots.txt answered 5xx or could not be fetched; crawlers may treat the whole site as disallowed.'),
  'chain-too-long': rule('warn', 'More redirect hops than maxHops.'),
  'trailing-slash-hop': rule('warn', 'A hop only adds or removes a trailing slash.'),
  'redirect-to-homepage': rule('warn', 'A deep URL ends at the homepage; Google may treat it as a soft 404.'),
  'redirect-collapse': rule('warn', 'Many old URLs end at the same page; Google may treat them as soft 404s.'),
  'query-dropped': rule('warn', 'The query string is lost on the way.'),
  'protocol-inconsistent': rule('warn', 'The final URL is http: while the site is https:.'),
  'host-inconsistent': rule('warn', 'The final host differs from the expected host only by "www.".'),
  'location-relative': rule('off', 'A Location header is relative (legal per RFC 9110; informational).'),
  'sitemap-url-redirects': rule('error', 'diff: a URL in the new sitemap answers with a redirect.', 'List the final URL in the sitemap instead of {from}.'),
  'sitemap-url-not-indexable': rule('error', 'diff: a URL in the new sitemap is not 200, is noindex or is blocked by robots.txt.', 'Fix {from} or remove it from the new sitemap.'),
  'orphan-url': rule('error', 'diff: an old URL is not in the new sitemap, is not redirected and does not answer 200.', 'Add a redirect from {from} to its replacement.'),
};

/** @type {Readonly<Record<keyof typeof DEFS, Readonly<RuleInfo>>>} */
export const RULES = Object.freeze(
  /** @type {any} */ (
    Object.fromEntries(
      Object.entries(DEFS).map(([id, def]) => [
        id,
        Object.freeze({ ...def, docsUrl: `${DOCS_URL}#${id}`, ...(id === 'redirect-collapse' ? { group: true } : {}) }),
      ]),
    )
  ),
);

export const RULE_IDS = Object.freeze(Object.keys(RULES));
