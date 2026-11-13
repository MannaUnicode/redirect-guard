import { NetworkError } from '../errors.js';

export const ACCEPT = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8';

/**
 * Read a response body up to `max` bytes, then cancel the stream.
 * @param {Response} res
 * @param {number} max
 */
async function readCapped(res, max) {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = max - size;
    if (value.byteLength >= room) {
      chunks.push(value.subarray(0, room));
      size += room;
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  const out = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/**
 * @param {any} err
 * @param {number} timeout
 * @param {AbortSignal | undefined} userSignal
 */
function toNetworkError(err, timeout, userSignal) {
  if (userSignal?.aborted) {
    const e = userSignal.reason instanceof Error ? userSignal.reason : new Error('Aborted');
    /** @type {any} */ (e).aborted = true;
    return e;
  }
  if (err?.name === 'TimeoutError' || err?.cause?.name === 'TimeoutError') {
    return new NetworkError('ETIMEDOUT', `No response within ${timeout} ms`);
  }
  if (err instanceof NetworkError) return err;
  const cause = err?.cause;
  const code = cause?.code || err?.code || cause?.cause?.code || 'ERR_NETWORK';
  const message = cause?.message || err?.message || String(err);
  return new NetworkError(String(code), message);
}

/**
 * @typedef {object} RequestOptions
 * @property {typeof fetch} [fetch]
 * @property {Record<string, string>} [headers]
 * @property {number} [timeout]
 * @property {AbortSignal} [signal]
 * @property {false | 'html' | 'text' | 'bytes'} [readBody] when to read the body of a non-3xx response
 * @property {number} [maxBodyBytes]
 */

/**
 * One GET with redirect: 'manual'. Never follows redirects.
 * @param {string} url
 * @param {RequestOptions} [opts]
 */
export async function request(url, opts = {}) {
  const f = opts.fetch ?? globalThis.fetch;
  const timeout = opts.timeout ?? 15000;
  const timeoutSignal = AbortSignal.timeout(timeout);
  const signal = opts.signal ? AbortSignal.any([timeoutSignal, opts.signal]) : timeoutSignal;
  const started = performance.now();
  /** @type {Response} */
  let res;
  try {
    res = await f(url, { method: 'GET', redirect: 'manual', headers: opts.headers ?? {}, signal });
  } catch (err) {
    const e = toNetworkError(err, timeout, opts.signal);
    /** @type {any} */ (e).durationMs = Math.round(performance.now() - started);
    throw e;
  }
  const status = res.status;
  const location = res.headers.get('location');
  /** @type {string | Uint8Array | null} */
  let body = null;
  try {
    const ct = res.headers.get('content-type') || '';
    const isRedirect = status >= 300 && status < 400;
    const mode = opts.readBody ?? false;
    const wants = !isRedirect && (mode === 'text' || mode === 'bytes' || (mode === 'html' && /html/i.test(ct)));
    if (wants) {
      const bytes = await readCapped(res, opts.maxBodyBytes ?? 524288);
      body = mode === 'bytes' ? bytes : new TextDecoder('utf-8').decode(bytes);
    } else {
      await res.body?.cancel().catch(() => {});
    }
  } catch (err) {
    throw toNetworkError(err, timeout, opts.signal);
  }
  return {
    status,
    headers: res.headers,
    location,
    body,
    durationMs: Math.round(performance.now() - started),
  };
}
