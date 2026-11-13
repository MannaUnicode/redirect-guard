import { UsageError } from '../errors.js';
import { loadSitemap } from '../input/sitemap.js';
import { normalizeUrl } from '../url/normalize.js';
import { resolveOptions, prepareEntries, runEntries, buildReport } from '../engine.js';
import { displayPath } from '../check.js';

/**
 * Pure set diff of old and new sitemap URLs, mapped onto the new origin.
 * @param {string[]} oldUrls
 * @param {string[]} newUrls
 * @param {{ base?: string | null, ignoreTrailingSlash?: boolean }} [opts]
 */
export function diffUrlSets(oldUrls, newUrls, opts = {}) {
  const target = opts.base ? new URL(opts.base).origin : newUrls[0] ? new URL(newUrls[0]).origin : null;
  const toTarget = (/** @type {string} */ u) => {
    const x = new URL(u);
    return target ? target + x.pathname + x.search : x.href;
  };
  const norm = (/** @type {string} */ u) => normalizeUrl(u, { ignoreTrailingSlash: opts.ignoreTrailingSlash });
  /** @type {Map<string, string>} */
  const newMap = new Map();
  for (const u of newUrls) newMap.set(norm(toTarget(u)), toTarget(u));
  /** @type {Map<string, string>} */
  const oldMap = new Map();
  for (const u of oldUrls) oldMap.set(norm(toTarget(u)), toTarget(u));
  const kept = [];
  const removed = [];
  const added = [];
  for (const [k, u] of oldMap) (newMap.has(k) ? kept : removed).push(u);
  for (const [k, u] of newMap) if (!oldMap.has(k)) added.push(u);
  return { kept, removed, added, newUrls: [...newMap.values()] };
}

/**
 * Compare an old and a new sitemap; unless `offline`, check removed URLs
 * (must redirect to an indexable page) and new URLs (must answer 200 directly).
 * @param {Record<string, any>} options
 */
export async function diffSitemaps(options = {}) {
  const startedAt = new Date();
  const t0 = performance.now();
  if (!options.old || !options.new) throw new UsageError('diff needs --old <sitemap> and --new <sitemap>');
  const opts = resolveOptions(options);
  const cwd = options.cwd ?? process.cwd();
  const req = { fetch: options.fetch, headers: opts.headers, userAgent: opts.userAgent, timeout: opts.timeout, signal: options.signal, cwd };
  const oldUrls = await loadSitemap(options.old, req);
  const newUrls = await loadSitemap(options.new, req);
  const sets = diffUrlSets(oldUrls, newUrls, { base: opts.base, ignoreTrailingSlash: opts.ignoreTrailingSlash });
  const diff = {
    kept: sets.kept.length,
    removed: sets.removed.length,
    added: sets.added.length,
    removedUrls: sets.removed,
    addedUrls: sets.added,
  };
  const oldLabel = displayPath(options.old, cwd);
  const newLabel = displayPath(options.new, cwd);
  const input = { kind: 'diff', label: `${oldLabel} -> ${newLabel}` };
  /** @type {string[]} */
  const warnings = [];
  if (options.offline) {
    return buildReport([], opts, { startedAt, t0, input, warnings, diff });
  }
  /** @type {any[]} */
  const entries = [
    ...sets.removed.map((from, i) => ({ id: 0, source: `${oldLabel}#removed-${i + 1}`, from, role: 'removed', expected: { to: null, status: null, mode: 'any' } })),
    ...sets.newUrls.map((from, i) => ({ id: 0, source: `${newLabel}#${i + 1}`, from, role: 'new', expected: { to: null, status: [200], mode: 'present' } })),
  ];
  if (entries.length === 0) return buildReport([], opts, { startedAt, t0, input, warnings, diff });
  const prepared = prepareEntries(entries, opts, warnings);
  const work = await runEntries(prepared, opts, { fetch: options.fetch, signal: options.signal, onProgress: options.onProgress, sleep: options.sleep });
  return buildReport(work, opts, { startedAt, t0, input, warnings, diff });
}
