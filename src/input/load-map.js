import { readFile } from 'node:fs/promises';
import { extname, resolve as resolvePath } from 'node:path';
import { InputError } from '../errors.js';
import { parseCsvMap } from './csv.js';
import { parseJsonMap } from './json.js';
import { parseTextList } from './text.js';
import { loadSitemap } from './sitemap.js';

/** @typedef {'csv' | 'tsv' | 'json' | 'text' | 'sitemap'} MapFormat */

/**
 * Format from the extension, or sniffed from the content.
 * @param {string | undefined} path
 * @param {string} [text]
 * @returns {MapFormat}
 */
export function detectFormat(path, text) {
  const ext = path ? extname(path.replace(/\.gz$/i, '')).toLowerCase() : '';
  if (ext === '.csv') return 'csv';
  if (ext === '.tsv') return 'tsv';
  if (ext === '.json') return 'json';
  if (ext === '.txt') return 'text';
  if (ext === '.xml') return 'sitemap';
  const head = (text ?? '').replace(/^﻿/, '').trimStart();
  if (head.startsWith('[') || head.startsWith('{')) return 'json';
  if (head.startsWith('<')) return 'sitemap';
  return 'csv';
}

/**
 * Turn sitemap URLs into entries. With `base`, the origin of each URL is
 * replaced by the base origin (path and query kept).
 * @param {string[]} urls
 * @param {{ base?: string | null, label: string }} opts
 */
export function sitemapEntries(urls, opts) {
  const baseOrigin = opts.base ? new URL(opts.base).origin : null;
  return urls.map((loc, i) => {
    let from;
    try {
      const u = new URL(loc);
      from = baseOrigin ? baseOrigin + u.pathname + u.search : u.href;
    } catch {
      throw new InputError(`${opts.label}: invalid URL in <loc>: "${loc}"`);
    }
    return { source: `${opts.label}#${i + 1}`, from, expected: { to: null, status: null, mode: /** @type {const} */ ('any') } };
  });
}

/**
 * Load a redirect map into entries with ids.
 * @param {string | { path?: string, text?: string, format?: MapFormat }} input
 * @param {{ base?: string | null, cwd?: string, fetch?: typeof fetch, label?: string }} [opts]
 * @returns {Promise<import('../checks/evaluate.js').Entry[]>}
 */
export async function loadMap(input, opts = {}) {
  const spec = typeof input === 'string' ? { path: input } : input;
  const label = opts.label ?? spec.path ?? 'stdin';
  let text = spec.text;
  if (text === undefined) {
    if (!spec.path) throw new InputError('loadMap: give a path or text');
    const full = resolvePath(opts.cwd ?? process.cwd(), spec.path);
    let buf;
    try {
      buf = await readFile(full);
    } catch (/** @type {any} */ err) {
      throw new InputError(`cannot read ${label}: ${err.code === 'ENOENT' ? 'file not found' : err.message}`);
    }
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
      const urls = await loadSitemap(spec.path, { cwd: opts.cwd });
      return withIds(sitemapEntries(urls, { base: opts.base, label }));
    }
    text = buf.toString('utf8');
  }
  const format = spec.format ?? detectFormat(spec.path, text);
  /** @type {Omit<import('../checks/evaluate.js').Entry, 'id'>[]} */
  let entries;
  switch (format) {
    case 'csv':
    case 'tsv':
      entries = parseCsvMap(text, { file: label, base: opts.base });
      break;
    case 'json':
      entries = parseJsonMap(text, { file: label, base: opts.base });
      break;
    case 'text':
      entries = parseTextList(text, { file: label, base: opts.base });
      break;
    case 'sitemap': {
      const urls = await loadSitemap(label, { text, cwd: opts.cwd, fetch: opts.fetch });
      entries = sitemapEntries(urls, { base: opts.base, label });
      break;
    }
    default:
      throw new InputError(`unknown map format "${format}"`);
  }
  return withIds(entries);
}

/**
 * @template T
 * @param {T[]} entries
 * @returns {(T & { id: number })[]}
 */
export function withIds(entries) {
  return entries.map((e, i) => ({ ...e, id: i + 1 }));
}
