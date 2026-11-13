import { isRootPath, normalizeUrl } from '../url/normalize.js';
import { issue, shortUrl } from './issue.js';
import { chainIssues } from './chain.js';
import { destinationIssue } from './destination.js';
import { analyzeDestination } from './indexability.js';
import { isAllowed } from './robots.js';
import { RULES, RULE_IDS } from './rules.js';

/**
 * @typedef {import('../http/trace.js').Trace} Trace
 * @typedef {{ id: number, source: string, from: string, expected: { to: string | null, status: number[] | null, mode: 'redirect' | 'gone' | 'any' | 'present' }, role?: 'removed' | 'new' }} Entry
 * @typedef {{ state: 'ok', rules: import('./robots.js').RobotsRules, url: string } | { state: 'unreachable', url: string, detail: string } | { state: 'none', url: string }} RobotsResult
 */

/** @param {any} eff @param {Entry} entry */
export function refOrigin(eff, entry) {
  try {
    return new URL(eff.base || entry.from).origin;
  } catch {
    return null;
  }
}

/**
 * Run every per-entry check.
 * @param {Entry} entry
 * @param {Trace} trace
 * @param {any} eff effective options for this entry
 * @param {{ robots?: RobotsResult | null, toLogical?: (u: string) => string }} [extra]
 */
export function evaluateEntry(entry, trace, eff, extra = {}) {
  /** @type {ReturnType<typeof issue>[]} */
  const issues = [];
  const ref = refOrigin(eff, entry);
  const short = (/** @type {string} */ u) => shortUrl(u, ref);
  /** @type {{ robotsMeta: string[], xRobotsTag: string[], canonical: string | null, robotsAllowed: boolean | null } | null} */
  let indexability = null;
  const done = () => ({ issues, indexability });

  if (trace.error) {
    const hop = trace.chain[trace.chain.length - 1];
    const n = hop.attempts;
    issues.push(
      issue('request-failed', `${trace.error.code}: ${trace.error.message} (${n} attempt${n === 1 ? '' : 's'})`, {
        code: trace.error.code,
        hop: trace.chain.length,
        url: hop.url,
      }),
    );
    return done();
  }
  if (trace.loop) {
    const last = trace.chain[trace.chain.length - 1];
    issues.push(issue('redirect-loop', `${short(last.url)} redirects back to a URL already in the chain`, { location: last.location }));
    return done();
  }
  if (trace.tooMany) {
    issues.push(issue('too-many-redirects', `Gave up after ${trace.chain.length} redirects (maxRedirects ${eff.maxRedirects})`, { hops: trace.chain.length }));
    return done();
  }
  const final = /** @type {NonNullable<Trace['final']>} */ (trace.final);
  const redirects = trace.chain.length - 1;
  const mode = entry.expected.mode;
  const role = entry.role;

  if (mode === 'gone') {
    const st = /** @type {number[]} */ (entry.expected.status);
    if (!st.includes(final.status)) {
      const after = redirects ? ` after ${redirects} redirect${redirects === 1 ? '' : 's'} to ${short(final.url)}` : '';
      issues.push(issue('unexpected-status', `Expected ${st.join(' or ')} (gone), got ${final.status}${after}`, { expected: st, actual: final.status }));
    }
    return done();
  }

  if (mode === 'redirect' && redirects === 0) {
    const to = entry.expected.to ? ` to ${short(entry.expected.to)}` : '';
    if (final.status >= 200 && final.status < 300) {
      issues.push(issue('no-redirect', `Answers ${final.status} directly, expected a redirect${to}`, { status: final.status }));
    } else {
      issues.push(issue('target-not-ok', `Answers ${final.status}, no redirect${to}`, { status: final.status }));
    }
    return done();
  }

  if (mode === 'present' && redirects > 0) {
    if (role === 'new') {
      issues.push(issue('sitemap-url-redirects', `Listed in the new sitemap but redirects (${trace.chain[0].status}) to ${short(final.url)}`, { status: trace.chain[0].status, final: final.url }));
    } else {
      issues.push(issue('unexpected-status', `Expected 200 (kept), got ${trace.chain[0].status} to ${short(final.url)}`, { expected: [200], actual: trace.chain[0].status }));
    }
  }

  if (redirects > 0) {
    const expectStatus = entry.expected.status ?? eff.expectStatus;
    issues.push(...chainIssues(trace, expectStatus, { maxHops: eff.maxHops, checkStatus: mode !== 'present' }));
  }

  if (mode === 'redirect' && entry.expected.to) {
    const d = destinationIssue(final.url, entry.expected.to, eff, short);
    if (d) issues.push(d);
  }

  if (final.status !== 200) {
    if (role === 'removed') {
      issues.push(issue('orphan-url', `Not in the new sitemap and ${redirects ? `ends at ${short(final.url)} with` : 'answers'} ${final.status}`, { status: final.status }));
    } else if (role === 'new' || mode === 'present') {
      if (redirects === 0) {
        issues.push(
          role === 'new'
            ? issue('sitemap-url-not-indexable', `Answers ${final.status}`, { status: final.status })
            : issue('unexpected-status', `Expected 200 (kept), got ${final.status}`, { expected: [200], actual: final.status }),
        );
      } else {
        issues.push(issue('target-not-ok', `Ends at ${short(final.url)} with ${final.status}`, { status: final.status }));
      }
    } else {
      const msg = redirects ? `Ends at ${short(final.url)} with ${final.status}` : `Answers ${final.status}`;
      issues.push(issue('target-not-ok', msg, { status: final.status, url: final.url }));
    }
    return done();
  }

  if (eff.indexability) {
    const a = analyzeDestination(final, { robotsAgent: eff.robotsAgent, toLogical: extra.toLogical });
    indexability = { robotsMeta: a.robotsMeta, xRobotsTag: a.xRobotsTag, canonical: a.canonical, robotsAllowed: null };
    if (a.noindex) {
      const msg = a.noindex.source === 'X-Robots-Tag' ? `X-Robots-Tag: ${a.noindex.value}` : `<meta name="${a.noindex.source.slice(5)}" content="${a.noindex.value}">`;
      issues.push(
        role === 'new'
          ? issue('sitemap-url-not-indexable', `noindex: ${msg}`, { source: a.noindex.source, value: a.noindex.value })
          : issue('target-noindex', msg, { source: a.noindex.source, value: a.noindex.value }),
      );
    }
    if (a.canonical) {
      const cmp = { ignoreTrailingSlash: eff.ignoreTrailingSlash, ignoreQuery: eff.ignoreQuery };
      const c = normalizeUrl(a.canonical, cmp);
      const okTargets = [final.url, entry.expected.to].filter(Boolean).map((u) => normalizeUrl(/** @type {string} */ (u), cmp));
      if (!okTargets.includes(c)) {
        const details = { canonical: a.canonical, source: a.canonicalSource, ...a.canonicalDetails };
        const extraNote = a.canonicalDetails.htmlCount > 1 ? ` (${a.canonicalDetails.htmlCount} canonical tags, first used)` : '';
        issues.push(issue('canonical-mismatch', `Canonical points to ${short(a.canonical)}${extraNote}`, details));
      }
    }
    const robots = extra.robots;
    if (eff.robots && robots) {
      if (robots.state === 'ok') {
        const allowed = isAllowed(robots.rules, final.requestedUrl, eff.robotsAgent);
        indexability.robotsAllowed = allowed;
        if (!allowed) {
          const msg = `Disallowed by ${robots.url} for ${eff.robotsAgent}`;
          issues.push(role === 'new' ? issue('sitemap-url-not-indexable', msg, { robotsTxt: robots.url }) : issue('robots-blocked', msg, { robotsTxt: robots.url }));
        }
      } else if (robots.state === 'unreachable') {
        issues.push(issue('robots-unreachable', `${robots.url}: ${robots.detail}`, { robotsTxt: robots.url }));
      } else {
        indexability.robotsAllowed = true;
      }
    }
  }

  if (redirects > 0) {
    const fromU = new URL(entry.from);
    const finalU = new URL(final.url);
    const to = entry.expected.to;
    if (!isRootPath(entry.from) && isRootPath(final.url) && !finalU.search && !(to && isRootPath(to))) {
      issues.push(issue('redirect-to-homepage', `Ends at the homepage ${short(final.url)}; Google may treat it as a soft 404`, { final: final.url }));
    }
    if (fromU.search && !finalU.search && (eff.preserveQuery || mode === 'any')) {
      issues.push(issue('query-dropped', `Query ${fromU.search} is dropped on the way to ${short(final.url)}`, { query: fromU.search }));
    }
  }
  return done();
}

/**
 * Apply configured severities, drop "off" issues and compute the entry status.
 * @param {ReturnType<typeof issue>[]} issues
 * @param {Record<string, string>} rules
 */
export function applySeverities(issues, rules = {}) {
  const out = [];
  for (const i of issues) {
    const level = rules[i.rule] ?? RULES[/** @type {keyof typeof RULES} */ (i.rule)]?.severity ?? 'error';
    if (level === 'off') continue;
    out.push({ ...i, severity: /** @type {'error' | 'warn'} */ (level) });
  }
  const rank = (/** @type {{ rule: string, severity: string }} */ i) => (i.severity === 'error' ? 0 : 1000) + RULE_IDS.indexOf(i.rule);
  out.sort((a, b) => rank(a) - rank(b));
  const status = out.some((i) => i.severity === 'error') ? 'fail' : out.some((i) => i.severity === 'warn') ? 'warn' : 'ok';
  return { issues: out, status };
}
