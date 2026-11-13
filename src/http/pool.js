import { sleep as defaultSleep } from './retry.js';

/**
 * FIFO concurrency limiter.
 * @param {number} n
 */
export function createLimiter(n) {
  let active = 0;
  /** @type {{ fn: () => any, resolve: (v: any) => void, reject: (e: any) => void }[]} */
  const queue = [];
  const next = () => {
    if (active >= n || queue.length === 0) return;
    active++;
    const job = /** @type {(typeof queue)[number]} */ (queue.shift());
    Promise.resolve()
      .then(job.fn)
      .then(job.resolve, job.reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return {
    /**
     * @template T
     * @param {() => Promise<T> | T} fn
     * @returns {Promise<T>}
     */
    run(fn) {
      return new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        next();
      });
    },
    get active() {
      return active;
    },
    get pending() {
      return queue.length;
    },
  };
}

/**
 * Global concurrency limit plus a minimum gap between requests to the same origin.
 * @param {{ concurrency?: number, delay?: number, sleep?: (ms: number) => Promise<unknown>, now?: () => number }} [opts]
 */
export function createPool(opts = {}) {
  const limiter = createLimiter(opts.concurrency ?? 4);
  const delay = opts.delay ?? 0;
  const wait = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  /** @type {Map<string, number>} */
  const nextAt = new Map();
  return {
    /**
     * @template T
     * @param {string} origin
     * @param {() => Promise<T>} fn
     * @returns {Promise<T>}
     */
    run(origin, fn) {
      return limiter.run(async () => {
        if (delay > 0) {
          const t = now();
          const at = Math.max(t, nextAt.get(origin) ?? 0);
          nextAt.set(origin, at + delay);
          if (at > t) await wait(at - t);
        }
        return fn();
      });
    },
    get active() {
      return limiter.active;
    },
  };
}
