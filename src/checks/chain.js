import { differsOnlyByTrailingSlash } from '../url/normalize.js';
import { issue } from './issue.js';

/**
 * Chain-level issues: temporary hops, long chains, slash-only hops, relative Locations.
 * @param {import('../http/trace.js').Trace} trace
 * @param {number[]} expectStatus
 * @param {{ maxHops: number, checkStatus?: boolean }} opts
 */
export function chainIssues(trace, expectStatus, opts) {
  const issues = [];
  const redirects = trace.chain.slice(0, -1);
  if (opts.checkStatus !== false) {
    const bad = redirects.map((h, i) => ({ h, n: i + 1 })).filter(({ h }) => !expectStatus.includes(/** @type {number} */ (h.status)));
    if (bad.length) {
      const list = expectStatus.join(' or ');
      issues.push(
        issue('status-not-permanent', `Hop ${bad[0].n} returned ${bad[0].h.status}, expected ${list}`, {
          hops: bad.map((b) => b.n),
          statuses: bad.map((b) => b.h.status),
        }),
      );
    }
  }
  if (redirects.length > opts.maxHops) {
    issues.push(issue('chain-too-long', `${redirects.length} hops, limit is ${opts.maxHops}`, { hops: redirects.length, maxHops: opts.maxHops }));
  }
  const slash = [];
  for (let i = 0; i < redirects.length; i++) {
    const next = trace.chain[i + 1];
    if (next && differsOnlyByTrailingSlash(redirects[i].url, next.url)) slash.push(i + 1);
  }
  if (slash.length) {
    issues.push(issue('trailing-slash-hop', `Hop ${slash[0]} only changes the trailing slash`, { hops: slash }));
  }
  const rel = redirects.map((h, i) => ({ h, n: i + 1 })).filter(({ h }) => h.locationRelative);
  if (rel.length) {
    issues.push(issue('location-relative', `Hop ${rel[0].n} has a relative Location (${rel[0].h.location})`, { hops: rel.map((r) => r.n) }));
  }
  return issues;
}
