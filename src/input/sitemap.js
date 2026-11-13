import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { InputError } from '../errors.js';
import { parseSitemapXml } from '../parse/xml.js';
import { request } from '../http/request.js';
import { headersFor } from '../http/trace.js';

export const MAX_LOCS_PER_FILE = 50_000;
export const MAX_LOCS_TOTAL = 500_000;
const MAX_DEPTH = 3;
const MAX_SITEMAP_BYTES = 60 * 1024 * 1024;

/** @param {string} s */
const isRemote = (s) => /^https?:\/\//i.test(s);

/**
 * Fetch a remote resource, following up to 5 redirects.
 * @param {string} url
 * @param {any} opts
 */
export async function fetchFollowing(url, opts) {
  let current = url;
  for (let i = 0; i <= 5; i++) {
    const origin = new URL(current).origin;
    const res = await request(current, {
      fetch: opts.fetch,
      headers: headersFor(origin, opts),
      timeout: opts.timeout ?? 15000,
      signal: opts.signal,
      readBody: opts.readBody ?? 'bytes',
      maxBodyBytes: opts.maxBodyBytes ?? MAX_SITEMAP_BYTES,
    });
    if (res.status >= 300 && res.status < 400 && res.location) {
      current = new URL(res.location, current).href;
      continue;
    }
    return { ...res, url: current };
  }
  return { status: 310, headers: new Headers(), location: null, body: null, durationMs: 0, url: current };
}

/**
 * @param {Uint8Array} bytes
 * @param {string} label
 */
function decode(bytes, label) {
  let buf = bytes;
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      buf = gunzipSync(buf);
    } catch (err) {
      throw new InputError(`${label}: cannot decompress gzip data`, { cause: err });
    }
  }
  return new TextDecoder('utf-8').decode(buf);
}

/**
 * @param {string} src
 * @param {any} opts
 */
async function readSource(src, opts) {
  if (isRemote(src)) {
    let res;
    try {
      res = await fetchFollowing(src, opts);
    } catch (/** @type {any} */ err) {
      if (err?.aborted) throw err;
      throw new InputError(`cannot fetch sitemap ${src}: ${err.code ?? ''} ${err.message}`.replace(/\s+/g, ' '));
    }
    if (res.status !== 200) throw new InputError(`cannot fetch sitemap ${src}: HTTP ${res.status}`);
    return decode(/** @type {Uint8Array} */ (res.body), src);
  }
  const path = resolvePath(opts.cwd ?? process.cwd(), src);
  try {
    return decode(new Uint8Array(await readFile(path)), src);
  } catch (/** @type {any} */ err) {
    if (err instanceof InputError) throw err;
    throw new InputError(`cannot read sitemap ${src}: ${err.code === 'ENOENT' ? 'file not found' : err.message}`);
  }
}

/**
 * Load every <loc> of a sitemap (urlset or index, followed up to depth 3, .gz allowed).
 * @param {string} src URL or file path
 * @param {{ fetch?: typeof fetch, headers?: Record<string, string>, inScope?: Set<string>, userAgent?: string | null, timeout?: number, signal?: AbortSignal, cwd?: string, text?: string }} [opts]
 * @returns {Promise<string[]>}
 */
export async function loadSitemap(src, opts = {}) {
  /** @type {string[]} */
  const urls = [];
  const scope = opts.inScope ?? (isRemote(src) ? new Set([new URL(src).origin]) : new Set());
  const o = { ...opts, inScope: scope };

  /** @param {string} source @param {number} depth @param {string} [text] */
  async function walk(source, depth, text) {
    const xml = text ?? (await readSource(source, o));
    const { type, locs } = parseSitemapXml(xml, source);
    if (locs.length > MAX_LOCS_PER_FILE) {
      throw new InputError(`${source}: ${locs.length} <loc> entries, the limit is ${MAX_LOCS_PER_FILE} per file`);
    }
    if (type === 'sitemapindex') {
      if (depth >= MAX_DEPTH) throw new InputError(`${source}: sitemap index nested deeper than ${MAX_DEPTH} levels`);
      for (const loc of locs) {
        const child = isRemote(source) ? new URL(loc, source).href : loc;
        await walk(child, depth + 1);
      }
      return;
    }
    for (const loc of locs) {
      urls.push(loc);
      if (urls.length > MAX_LOCS_TOTAL) throw new InputError(`sitemap has more than ${MAX_LOCS_TOTAL} URLs in total`);
    }
  }

  await walk(src, 0, opts.text);
  return urls;
}
