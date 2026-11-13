import { normalizeUrl } from '../url/normalize.js';
import { issue, shortUrl } from './issue.js';

/**
 * @typedef {{ entry: import('./evaluate.js').Entry, trace: import('../http/trace.js').Trace, eff: any, issues: ReturnType<typeof issue>[] }} WorkResult
 */

/** @param {string[]} values */
function majority(values) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  let n = 0;
  for (const [v, c] of counts) {
    if (c > n) {
      best = v;
      n = c;
    }
  }
  return best;
}

/** @param {string} host */
const stripWww = (host) => host.replace(/^www\./i, '');

/**
 * Cross-entry checks. Mutates `issues` of each result and returns groups.
 * @param {WorkResult[]} results
 * @param {{ base?: string | null, collapseThreshold: number }} opts
 */
export function applyHeuristics(results, opts) {
  const withFinal = results.filter((r) => r.trace.final && !r.trace.error && !r.trace.loop && !r.trace.tooMany);

  // redirect-collapse
  /** @type {Map<string, WorkResult[]>} */
  const byTarget = new Map();
  for (const r of withFinal) {
    if (r.trace.chain.length < 2 || r.entry.expected.mode === 'gone') continue;
    const key = normalizeUrl(/** @type {any} */ (r.trace.final).url);
    const list = byTarget.get(key) ?? [];
    list.push(r);
    byTarget.set(key, list);
  }
  /** @type {{ target: string, count: number, ids: number[] }[]} */
  const collapse = [];
  for (const [target, list] of byTarget) {
    const distinct = new Set(list.map((r) => normalizeUrl(r.entry.from)));
    const threshold = Math.min(...list.map((r) => r.eff.collapseThreshold ?? opts.collapseThreshold));
    if (distinct.size < threshold) continue;
    const ids = list.map((r) => r.entry.id);
    collapse.push({ target, count: distinct.size, ids });
    for (const r of list) {
      const ref = r.eff.base ? new URL(r.eff.base).origin : new URL(r.entry.from).origin;
      r.issues.push(issue('redirect-collapse', `One of ${distinct.size} URLs ending at ${shortUrl(target, ref)}`, { target, count: distinct.size }));
    }
  }

  // protocol / host consistency
  const finals = withFinal.map((r) => new URL(/** @type {any} */ (r.trace.final).url));
  const baseU = opts.base ? new URL(opts.base) : null;
  const refProtocol = baseU ? baseU.protocol : majority(finals.map((u) => u.protocol));
  const refHost = baseU ? baseU.host : majority(finals.map((u) => u.host));
  for (const r of withFinal) {
    const u = new URL(/** @type {any} */ (r.trace.final).url);
    const rBase = r.eff.base ? new URL(r.eff.base) : null;
    const proto = rBase ? rBase.protocol : refProtocol;
    const host = rBase ? rBase.host : refHost;
    if (proto === 'https:' && u.protocol === 'http:') {
      r.issues.push(issue('protocol-inconsistent', `Ends on http: (${u.href}) while the site is https:`, { final: u.href }));
    }
    if (host && u.host !== host && stripWww(u.host) === stripWww(host)) {
      r.issues.push(issue('host-inconsistent', `Ends on host ${u.host}, expected ${host}`, { host: u.host, expected: host }));
    }
  }
  return { collapse };
}
