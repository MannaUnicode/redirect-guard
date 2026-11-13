import { version } from '../version.js';
import { normalizeUrl } from '../url/normalize.js';
import { createRewriter } from '../url/rewrite.js';
import { request, ACCEPT } from './request.js';
import { withRetry } from './retry.js';
import { createPool } from './pool.js';

export const DEFAULT_USER_AGENT = `redirect-guard/${version} (+https://github.com/OWNER/redirect-guard)`;

/**
 * @typedef {object} Hop
 * @property {string} url logical URL (production space)
 * @property {string | null} requestedUrl URL actually requested when a host rewrite applied
 * @property {number | null} status
 * @property {string | null} location raw Location header
 * @property {boolean} [locationRelative]
 * @property {number | null} durationMs
 * @property {number} attempts
 * @property {{ code: string, message: string } | null} error
 */

/**
 * @typedef {object} Trace
 * @property {string} url
 * @property {Hop[]} chain
 * @property {{ url: string, requestedUrl: string, status: number, headers: Record<string, string | null>, body: string | null } | null} final
 * @property {{ code: string, message: string } | null} error
 * @property {boolean} loop
 * @property {boolean} tooMany
 */

/** @param {Headers} h */
function pickHeaders(h) {
  return {
    'content-type': h.get('content-type'),
    'x-robots-tag': h.get('x-robots-tag'),
    link: h.get('link'),
  };
}

/**
 * Build the header set for a request: custom headers only for in-scope origins.
 * @param {string} origin
 * @param {{ userAgent?: string | null, headers?: Record<string, string>, inScope?: Set<string> }} opts
 */
export function headersFor(origin, opts) {
  /** @type {Record<string, string>} */
  const h = { 'user-agent': opts.userAgent || DEFAULT_USER_AGENT, accept: ACCEPT };
  if (opts.headers && opts.inScope && opts.inScope.has(origin)) {
    for (const [k, v] of Object.entries(opts.headers)) h[k.toLowerCase()] = v;
  }
  return h;
}

/**
 * Follow every redirect hop by hand and record the chain.
 * @param {string} startUrl
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetch]
 * @param {Record<string, string>} [opts.headers]
 * @param {Set<string>} [opts.inScope]
 * @param {Record<string, string>} [opts.hostRewrite]
 * @param {ReturnType<typeof createRewriter>} [opts.rewriter]
 * @param {ReturnType<typeof createPool>} [opts.pool]
 * @param {string | null} [opts.userAgent]
 * @param {number} [opts.timeout]
 * @param {number} [opts.retries]
 * @param {number} [opts.maxRedirects]
 * @param {boolean} [opts.readBody]
 * @param {number} [opts.maxBodyBytes]
 * @param {AbortSignal} [opts.signal]
 * @param {(ms: number, signal?: AbortSignal) => Promise<unknown>} [opts.sleep]
 * @returns {Promise<Trace>}
 */
export async function traceRedirects(startUrl, opts = {}) {
  const rewriter = opts.rewriter ?? createRewriter(opts.hostRewrite);
  const pool = opts.pool ?? createPool({ concurrency: 1 });
  const maxRedirects = opts.maxRedirects ?? 10;
  const first = new URL(startUrl).href;
  const inScope = opts.inScope ?? new Set([new URL(rewriter.toRequest(first)).origin]);
  /** @type {Hop[]} */
  const chain = [];
  /** @type {Trace} */
  const trace = { url: first, chain, final: null, error: null, loop: false, tooMany: false };
  const seen = new Set([normalizeUrl(first)]);
  let current = first;

  for (;;) {
    const requestUrl = rewriter.toRequest(current);
    const reqU = new URL(requestUrl);
    reqU.hash = '';
    const origin = reqU.origin;
    const headers = headersFor(origin, { userAgent: opts.userAgent, headers: opts.headers, inScope });
    const requestedUrl = rewriter.active && requestUrl !== current ? reqU.href : null;
    /** @type {Awaited<ReturnType<typeof request>>} */
    let res;
    let attempts;
    try {
      ({ result: res, attempts } = await withRetry(
        () =>
          pool.run(origin, () =>
            request(reqU.href, {
              fetch: opts.fetch,
              headers,
              timeout: opts.timeout,
              signal: opts.signal,
              readBody: opts.readBody === false ? false : 'html',
              maxBodyBytes: opts.maxBodyBytes,
            }),
          ),
        { retries: opts.retries ?? 2, sleep: opts.sleep, signal: opts.signal },
      ));
    } catch (/** @type {any} */ err) {
      if (err?.aborted) throw err;
      const error = { code: String(err?.code ?? 'ERR_NETWORK'), message: String(err?.message ?? err) };
      chain.push({
        url: current,
        requestedUrl,
        status: null,
        location: null,
        durationMs: err?.durationMs ?? null,
        attempts: err?.attempts ?? 1,
        error,
      });
      trace.error = error;
      return trace;
    }

    /** @type {Hop} */
    const hop = {
      url: current,
      requestedUrl,
      status: res.status,
      location: res.location,
      durationMs: res.durationMs,
      attempts,
      error: null,
    };
    chain.push(hop);

    let next = null;
    if (res.status >= 300 && res.status < 400 && res.location) {
      try {
        next = new URL(res.location, reqU.href);
      } catch {
        next = null;
      }
    }
    if (!next || !/^https?:$/.test(next.protocol)) {
      trace.final = {
        url: current,
        requestedUrl: reqU.href,
        status: res.status,
        headers: pickHeaders(res.headers),
        body: typeof res.body === 'string' ? res.body : null,
      };
      return trace;
    }
    hop.locationRelative = !/^[a-z][a-z0-9+.-]*:/i.test(String(res.location).trim());
    const logical = rewriter.toLogical(next.href);
    const norm = normalizeUrl(logical);
    if (seen.has(norm)) {
      trace.loop = true;
      return trace;
    }
    if (chain.length > maxRedirects) {
      trace.tooMany = true;
      return trace;
    }
    seen.add(norm);
    current = logical;
  }
}
