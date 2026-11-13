export const RETRY_STATUS = new Set([429, 503]);
const RETRY_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ECONNABORTED']);
export const MAX_RETRY_AFTER_MS = 60_000;

/** @param {any} err */
export function isRetryableError(err) {
  if (!err || err.aborted) return false;
  const code = String(err.code || '');
  return RETRY_CODES.has(code) || code.startsWith('UND_ERR_');
}

/**
 * Parse Retry-After (delta-seconds or HTTP date) into milliseconds.
 * @param {string | null | undefined} value
 * @param {number} [now]
 */
export function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  const t = Date.parse(v);
  if (!Number.isNaN(t)) return Math.max(0, t - now);
  return null;
}

/**
 * Abortable sleep based on the global setTimeout (so node:test mock.timers can drive it).
 * @param {number} ms
 * @param {AbortSignal} [signal]
 */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason);
    };
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(undefined);
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Retry `fn` on 429/503 responses and transient network errors.
 * Waits for Retry-After (capped at 60 s) or 500ms * 2^n + 0-250 ms jitter.
 * @template {{ status: number, headers: Headers }} T
 * @param {() => Promise<T>} fn
 * @param {{ retries?: number, sleep?: (ms: number, signal?: AbortSignal) => Promise<unknown>, random?: () => number, signal?: AbortSignal }} [opts]
 * @returns {Promise<{ result: T, attempts: number }>}
 */
export async function withRetry(fn, opts = {}) {
  const retries = opts.retries ?? 2;
  const wait = opts.sleep ?? sleep;
  const random = opts.random ?? Math.random;
  let attempt = 0;
  for (;;) {
    attempt++;
    /** @type {T | undefined} */
    let res;
    /** @type {any} */
    let err;
    try {
      res = await fn();
    } catch (e) {
      err = e;
    }
    if (err) {
      if (!isRetryableError(err) || attempt > retries) {
        err.attempts = attempt;
        throw err;
      }
    } else if (!RETRY_STATUS.has(/** @type {T} */ (res).status) || attempt > retries) {
      return { result: /** @type {T} */ (res), attempts: attempt };
    }
    let ms = res ? parseRetryAfter(res.headers.get('retry-after')) : null;
    if (ms == null) ms = 500 * 2 ** (attempt - 1) + Math.floor(random() * 250);
    await wait(Math.min(ms, MAX_RETRY_AFTER_MS), opts.signal);
  }
}
