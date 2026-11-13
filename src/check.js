import { relative, isAbsolute } from 'node:path';
import { InputError, UsageError } from './errors.js';
import { loadMap, sitemapEntries, withIds } from './input/load-map.js';
import { loadSitemap } from './input/sitemap.js';
import { rowToEntry } from './input/entry.js';
import { resolveOptions, prepareEntries, runEntries, buildReport } from './engine.js';

/**
 * Show a path relative to cwd when it lives inside it.
 * @param {string} p
 * @param {string} cwd
 */
export function displayPath(p, cwd) {
  if (/^https?:\/\//i.test(p) || !isAbsolute(p)) return p;
  const rel = relative(cwd, p);
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : p;
}

/**
 * Accept full entries or `{ from, to?, status? }` rows.
 * @param {any[]} list
 * @param {any} opts
 */
function normalizeEntries(list, opts) {
  return withIds(
    list.map((e, i) => {
      const source = e.source ?? `entries#${i + 1}`;
      if (e.expected && typeof e.expected === 'object') {
        const base = rowToEntry({ from: e.from }, { base: opts.base, source });
        return { ...e, source, from: base.from, expected: { to: e.expected.to ?? null, status: e.expected.status ?? null, mode: e.expected.mode ?? 'redirect' } };
      }
      return rowToEntry({ from: e.from, to: e.to, status: e.status }, { base: opts.base, source });
    }),
  );
}

/**
 * Check a redirect map, an old sitemap or a list of entries against the live site.
 * @param {Record<string, any>} options see types/index.d.ts CheckOptions
 */
export async function check(options = {}) {
  const startedAt = new Date();
  const t0 = performance.now();
  const opts = resolveOptions(options);
  const cwd = options.cwd ?? process.cwd();
  /** @type {string[]} */
  const warnings = [];
  let entries;
  /** @type {{ kind: string, label: string | null }} */
  let input;
  if (options.entries) {
    entries = normalizeEntries(options.entries, opts);
    input = { kind: 'entries', label: null };
  } else if (opts.map && opts.sitemap) {
    throw new UsageError('give either a map file or --sitemap, not both');
  } else if (opts.map) {
    const label = displayPath(opts.map, cwd);
    entries = await loadMap(opts.map, { base: opts.base, cwd, fetch: options.fetch, label });
    input = { kind: 'map', label };
  } else if (opts.sitemap) {
    const label = displayPath(opts.sitemap, cwd);
    const urls = await loadSitemap(opts.sitemap, {
      fetch: options.fetch,
      headers: opts.headers,
      userAgent: opts.userAgent,
      timeout: opts.timeout,
      signal: options.signal,
      cwd,
    });
    entries = withIds(sitemapEntries(urls, { base: opts.base, label }));
    input = { kind: 'sitemap', label };
  } else {
    throw new UsageError('nothing to check: give a map file (CSV, TSV, JSON, TXT) or --sitemap <url|file>');
  }
  if (entries.length === 0) throw new InputError(`no entries found in ${input.label ?? 'the input'}`);
  entries = prepareEntries(entries, opts, warnings);
  const work = await runEntries(entries, opts, { fetch: options.fetch, signal: options.signal, onProgress: options.onProgress, sleep: options.sleep });
  return buildReport(work, opts, { startedAt, t0, input, warnings });
}
