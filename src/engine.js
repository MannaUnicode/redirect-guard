import { DEFAULTS } from './config/defaults.js';
import { validateConfig } from './config/validate.js';
import { mergeOptions } from './config/merge.js';
import { UsageError } from './errors.js';
import { createRewriter } from './url/rewrite.js';
import { globToRegExp, createMatcher } from './url/glob.js';
import { normalizeUrl, pathAndSearch } from './url/normalize.js';
import { createPool, createLimiter } from './http/pool.js';
import { traceRedirects } from './http/trace.js';
import { withRetry } from './http/retry.js';
import { fetchFollowing } from './input/sitemap.js';
import { parseRobots } from './checks/robots.js';
import { evaluateEntry, applySeverities } from './checks/evaluate.js';
import { applyHeuristics } from './checks/heuristics.js';
import { shortUrl } from './checks/issue.js';
import { version } from './version.js';

/** Keys of CheckOptions that are runtime hooks, not config. */
const RUNTIME_KEYS = ['entries', 'fetch', 'signal', 'onProgress', 'cwd', 'sleep', 'old', 'new', 'offline'];

/**
 * Validate and merge user options over DEFAULTS.
 * @param {Record<string, any>} input
 */
export function resolveOptions(input = {}) {
  /** @type {Record<string, any>} */
  const cfg = {};
  for (const [k, v] of Object.entries(input)) {
    if (!RUNTIME_KEYS.includes(k) && v !== undefined) cfg[k] = v;
  }
  validateConfig(cfg);
  const opts = mergeOptions(DEFAULTS, cfg);
  opts._overrides = (opts.overrides ?? []).map((/** @type {any} */ o) => {
    const { match, ...rest } = o;
    return { re: globToRegExp(match), rest };
  });
  return opts;
}

/**
 * Options for one entry after applying matching overrides (later ones win).
 * @param {any} opts
 * @param {{ from: string }} entry
 */
export function effectiveFor(opts, entry) {
  if (!opts._overrides || opts._overrides.length === 0) return opts;
  const target = pathAndSearch(entry.from);
  let eff = opts;
  for (const o of opts._overrides) {
    if (o.re.test(target)) eff = mergeOptions(eff, o.rest);
  }
  return eff;
}

/**
 * Remove duplicate `from` URLs (the last row wins) and apply include/exclude/limit.
 * @param {import('./checks/evaluate.js').Entry[]} entries
 * @param {any} opts
 * @param {string[]} warnings
 */
export function prepareEntries(entries, opts, warnings) {
  /** @type {Map<string, number>} */
  const lastIndex = new Map();
  entries.forEach((e, i) => {
    const key = normalizeUrl(e.from);
    if (lastIndex.has(key)) {
      const prev = entries[/** @type {number} */ (lastIndex.get(key))];
      warnings.push(`duplicate "from" ${shortUrl(e.from, opts.base ? new URL(opts.base).origin : null)} at ${prev.source} and ${e.source}; the last row wins`);
    }
    lastIndex.set(key, i);
  });
  let out = entries.filter((e, i) => lastIndex.get(normalizeUrl(e.from)) === i);
  const loaded = out.length;
  const notes = [];
  if (opts.include?.length) {
    const m = createMatcher(opts.include);
    const before = out.length;
    out = out.filter((e) => m(pathAndSearch(e.from)));
    if (before !== out.length) notes.push(`${before - out.length} excluded by --include ${opts.include.map((g) => `"${g}"`).join(' ')}`);
  }
  if (opts.exclude?.length) {
    const m = createMatcher(opts.exclude);
    const before = out.length;
    out = out.filter((e) => !m(pathAndSearch(e.from)));
    if (before !== out.length) notes.push(`${before - out.length} excluded by --exclude ${opts.exclude.map((g) => `"${g}"`).join(' ')}`);
  }
  if (opts.limit && out.length > opts.limit) out = out.slice(0, opts.limit);
  if (out.length === 0 && loaded > 0) {
    throw new UsageError(`no entries to check (${loaded} loaded, ${notes.join(', ') || 'all filtered out'})`);
  }
  return out.map((e, i) => ({ ...e, id: i + 1 }));
}

/**
 * Trace and evaluate every entry with bounded concurrency.
 * @param {import('./checks/evaluate.js').Entry[]} entries
 * @param {any} opts
 * @param {{ fetch?: typeof fetch, signal?: AbortSignal, onProgress?: (done: number, total: number, stats: { fail: number, active: number }) => void, sleep?: any }} runtime
 */
export async function runEntries(entries, opts, runtime = {}) {
  const rewriter = createRewriter(opts.hostRewrite);
  /** @type {Set<string>} */
  const inScope = new Set();
  const add = (/** @type {string} */ u) => {
    try {
      inScope.add(new URL(u).origin);
      inScope.add(new URL(rewriter.toRequest(u)).origin);
    } catch {
      /* ignore */
    }
  };
  if (opts.base) add(opts.base);
  rewriter.targets.forEach(add);
  for (const e of entries) add(e.from);

  const pool = createPool({ concurrency: opts.concurrency, delay: opts.delay, sleep: runtime.sleep });
  const limiter = createLimiter(opts.concurrency);
  /** @type {Map<string, Promise<any>>} */
  const robotsCache = new Map();

  const robotsFor = (/** @type {string} */ origin) => {
    let p = robotsCache.get(origin);
    if (!p) {
      const url = `${origin}/robots.txt`;
      p = withRetry(
        () =>
          pool.run(origin, () =>
            fetchFollowing(url, {
              fetch: runtime.fetch,
              headers: opts.headers,
              inScope,
              userAgent: opts.userAgent,
              timeout: opts.timeout,
              signal: runtime.signal,
              readBody: 'text',
              maxBodyBytes: 500 * 1024,
            }),
          ),
        { retries: opts.retries, sleep: runtime.sleep, signal: runtime.signal },
      ).then(
        ({ result }) => {
          if (result.status === 200) return { state: 'ok', url, rules: parseRobots(String(result.body ?? '')) };
          if (result.status >= 500 || result.status === 429) return { state: 'unreachable', url, detail: `HTTP ${result.status}` };
          return { state: 'none', url };
        },
        (/** @type {any} */ err) => {
          if (err?.aborted) throw err;
          return { state: 'unreachable', url, detail: `${err.code ?? 'ERR_NETWORK'}: ${err.message}` };
        },
      );
      robotsCache.set(origin, p);
    }
    return p;
  };

  let done = 0;
  let failing = 0;
  const total = entries.length;
  return Promise.all(
    entries.map((entry) =>
      limiter.run(async () => {
        const eff = effectiveFor(opts, entry);
        const trace = await traceRedirects(entry.from, {
          fetch: runtime.fetch,
          headers: opts.headers,
          inScope,
          rewriter,
          pool,
          userAgent: opts.userAgent,
          timeout: opts.timeout,
          retries: opts.retries,
          maxRedirects: opts.maxRedirects,
          readBody: eff.indexability,
          maxBodyBytes: opts.maxBodyBytes,
          signal: runtime.signal,
          sleep: runtime.sleep,
        });
        let robots = null;
        if (trace.final && trace.final.status === 200 && eff.indexability && eff.robots && entry.expected.mode !== 'gone') {
          robots = await robotsFor(new URL(trace.final.requestedUrl).origin);
        }
        const { issues, indexability } = evaluateEntry(entry, trace, eff, { robots, toLogical: rewriter.toLogical });
        done++;
        if (applySeverities(issues, eff.rules).status === 'fail') failing++;
        runtime.onProgress?.(done, total, { fail: failing, active: pool.active });
        return { entry, trace, eff, issues, indexability };
      }),
    ),
  );
}

/** @param {Record<string, any>} opts */
export function sanitizeOptions(opts) {
  const masked = Object.fromEntries(Object.keys(opts.headers ?? {}).map((k) => [k, '***']));
  return {
    base: opts.base ?? null,
    hostRewrite: opts.hostRewrite ?? {},
    expectStatus: opts.expectStatus,
    maxHops: opts.maxHops,
    maxRedirects: opts.maxRedirects,
    concurrency: opts.concurrency,
    delay: opts.delay,
    timeout: opts.timeout,
    retries: opts.retries,
    userAgent: opts.userAgent ?? null,
    headers: masked,
    robotsAgent: opts.robotsAgent,
    indexability: opts.indexability,
    robots: opts.robots,
    ignoreTrailingSlash: opts.ignoreTrailingSlash,
    ignoreQuery: opts.ignoreQuery,
    preserveQuery: opts.preserveQuery,
    collapseThreshold: opts.collapseThreshold,
    failOn: opts.failOn,
  };
}

/**
 * Cross-entry heuristics, severities and the final Report object.
 * @param {Awaited<ReturnType<typeof runEntries>>} work
 * @param {any} opts
 * @param {{ startedAt: Date, t0: number, input: { kind: string, label: string | null }, warnings: string[], diff?: any }} meta
 */
export function buildReport(work, opts, meta) {
  const groups = applyHeuristics(work, { base: opts.base, collapseThreshold: opts.collapseThreshold });
  /** @type {Record<string, number>} */
  const byRule = {};
  const summary = { total: work.length, ok: 0, warn: 0, fail: 0, byRule };
  const results = work.map((r) => {
    const { issues, status } = applySeverities(r.issues, r.eff.rules);
    summary[status]++;
    for (const i of issues) byRule[i.rule] = (byRule[i.rule] ?? 0) + 1;
    const mode = r.entry.expected.mode;
    return {
      id: r.entry.id,
      source: r.entry.source,
      from: r.entry.from,
      ...(r.entry.role ? { role: r.entry.role } : {}),
      expected: {
        to: r.entry.expected.to,
        status: r.entry.expected.status ?? (mode === 'redirect' || mode === 'any' ? [...r.eff.expectStatus] : null),
        mode,
      },
      status,
      chain: r.trace.chain.map((h) => ({
        url: h.url,
        requestedUrl: h.requestedUrl,
        status: h.status,
        location: h.location,
        durationMs: h.durationMs,
        attempts: h.attempts,
        error: h.error,
      })),
      final: r.trace.final
        ? {
            url: r.trace.final.url,
            status: r.trace.final.status,
            indexability: r.indexability,
          }
        : null,
      issues,
    };
  });
  const collapseOn = results.some((r) => r.issues.some((i) => i.rule === 'redirect-collapse'));
  return {
    schemaVersion: 1,
    tool: { name: 'redirect-guard', version },
    startedAt: meta.startedAt.toISOString(),
    durationMs: Math.round(performance.now() - meta.t0),
    input: meta.input,
    options: sanitizeOptions(opts),
    summary,
    results,
    groups: { collapse: collapseOn ? groups.collapse : [] },
    diff: meta.diff ?? null,
    warnings: meta.warnings,
  };
}

/**
 * 0 when nothing reaches the fail level, 1 otherwise.
 * @param {{ summary: { fail: number, warn: number } }} report
 * @param {'error' | 'warn'} [failOn]
 * @returns {0 | 1}
 */
export function exitCodeFor(report, failOn = 'error') {
  if (report.summary.fail > 0) return 1;
  if (failOn === 'warn' && report.summary.warn > 0) return 1;
  return 0;
}
