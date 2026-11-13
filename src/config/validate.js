import { ConfigError } from '../errors.js';
import { RULE_IDS } from '../checks/rules.js';
import { closest } from '../util/suggest.js';
import { DEFAULTS, OVERRIDE_KEYS } from './defaults.js';

const REPORTERS = ['text', 'json', 'markdown', 'junit', 'github'];

/** @typedef {(value: any, path: string) => void} Check */

/** @param {string} path @param {string} msg @param {string} [hint] */
const fail = (path, msg, hint) => {
  throw new ConfigError(`invalid config: ${path} ${msg}`, hint ? { hint } : {});
};

/** @param {number} min @param {number} [max] @returns {Check} */
const int = (min, max = Number.MAX_SAFE_INTEGER) => (v, p) => {
  if (!Number.isInteger(v) || v < min || v > max) fail(p, `must be an integer between ${min} and ${max}, got ${JSON.stringify(v)}`);
};
/** @type {Check} */
const bool = (v, p) => {
  if (typeof v !== 'boolean') fail(p, `must be true or false, got ${JSON.stringify(v)}`);
};
/** @param {boolean} nullable @returns {Check} */
const str = (nullable) => (v, p) => {
  if (v === null && nullable) return;
  if (typeof v !== 'string' || v === '') fail(p, `must be a non-empty string${nullable ? ' or null' : ''}`);
};
/** @param {boolean} nullable @returns {Check} */
const origin = (nullable) => (v, p) => {
  if (v === null && nullable) return;
  if (typeof v !== 'string') fail(p, 'must be an http(s) URL');
  let u;
  try {
    u = new URL(v);
  } catch {
    fail(p, `must be an http(s) URL, got "${v}"`);
    return;
  }
  if (!/^https?:$/.test(u.protocol)) fail(p, `must be an http(s) URL, got "${v}"`);
};
/** @type {Check} */
const strArray = (v, p) => {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) fail(p, 'must be an array of strings');
};
/** @type {Check} */
const statusList = (v, p) => {
  if (!Array.isArray(v) || v.length === 0 || v.some((x) => !Number.isInteger(x) || x < 300 || x > 399)) {
    fail(p, 'must be a non-empty array of 3xx status codes, e.g. [301, 308]');
  }
};
/** @type {Check} */
const headers = (v, p) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(p, 'must be an object of header names to string values');
  for (const [k, val] of Object.entries(v)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(k)) fail(`${p}.${k}`, 'is not a valid header name');
    if (typeof val !== 'string') fail(`${p}.${k}`, 'must be a string');
  }
};
/** @type {Check} */
const hostRewrite = (v, p) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(p, 'must be an object { "https://from": "https://to" }');
  for (const [k, val] of Object.entries(v)) {
    origin(false)(k, `${p} key`);
    origin(false)(val, `${p}["${k}"]`);
  }
};
/** @type {Check} */
const rules = (v, p) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(p, 'must be an object of rule ids to "error" | "warn" | "off"');
  for (const [k, val] of Object.entries(v)) {
    if (!RULE_IDS.includes(k)) {
      const s = closest(k, RULE_IDS);
      fail(`${p}.${k}`, 'is not a known rule id', s ? `Did you mean "${s}"?` : 'See docs/rules.md for the list of rule ids.');
    }
    if (!['error', 'warn', 'off'].includes(val)) fail(`${p}.${k}`, `must be "error", "warn" or "off", got ${JSON.stringify(val)}`);
  }
};
/** @type {Check} */
const reporters = (v, p) => {
  strArray(v, p);
  for (const r of v) {
    const name = r.split(':')[0];
    if (!REPORTERS.includes(name)) {
      const s = closest(name, REPORTERS);
      fail(`${p}`, `contains unknown reporter "${name}"`, s ? `Did you mean "${s}"?` : `Use one of: ${REPORTERS.join(', ')}.`);
    }
  }
};

/** @type {Record<string, Check>} */
export const CHECKS = {
  $schema: str(false),
  base: origin(true),
  map: str(true),
  sitemap: str(true),
  hostRewrite,
  expectStatus: statusList,
  maxHops: int(0, 50),
  maxRedirects: int(1, 50),
  concurrency: int(1, 32),
  delay: int(0, 600000),
  timeout: int(1, 600000),
  retries: int(0, 5),
  userAgent: str(true),
  headers,
  robotsAgent: str(false),
  indexability: bool,
  robots: bool,
  ignoreTrailingSlash: bool,
  ignoreQuery: bool,
  preserveQuery: bool,
  collapseThreshold: int(2),
  include: strArray,
  exclude: strArray,
  limit: (v, p) => {
    if (v !== null) int(1)(v, p);
  },
  failOn: (v, p) => {
    if (v !== 'error' && v !== 'warn') fail(p, `must be "error" or "warn", got ${JSON.stringify(v)}`);
  },
  rules,
  overrides: (v, p) => {
    if (!Array.isArray(v)) fail(p, 'must be an array');
    v.forEach((/** @type {any} */ o, i) => {
      const op = `${p}[${i}]`;
      if (!o || typeof o !== 'object' || Array.isArray(o)) fail(op, 'must be an object');
      if (typeof o.match !== 'string' || !o.match) fail(`${op}.match`, 'must be a glob string, e.g. "/blog/**"');
      for (const [k, val] of Object.entries(o)) {
        if (k === 'match') continue;
        if (!OVERRIDE_KEYS.includes(k)) {
          const s = closest(k, OVERRIDE_KEYS);
          fail(`${op}.${k}`, 'is not allowed in overrides', s ? `Did you mean "${s}"?` : `Allowed: match, ${OVERRIDE_KEYS.join(', ')}.`);
        }
        CHECKS[k](val, `${op}.${k}`);
      }
    });
  },
  reporters,
  maxBodyBytes: int(1024, 64 * 1024 * 1024),
};

export const CONFIG_KEYS = Object.freeze(Object.keys(CHECKS));

/**
 * Validate a config object. Throws ConfigError with the offending path.
 * @param {Record<string, unknown>} cfg
 * @param {{ allowExtra?: string[] }} [opts]
 */
export function validateConfig(cfg, opts = {}) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new ConfigError('invalid config: expected an object');
  const known = [...CONFIG_KEYS, ...(opts.allowExtra ?? [])];
  for (const [k, v] of Object.entries(cfg)) {
    if (!known.includes(k)) {
      const s = closest(k, CONFIG_KEYS);
      fail(k, 'is not a known option', s ? `Did you mean "${s}"?` : 'See docs/configuration.md.');
    }
    if (v === undefined || !CHECKS[k]) continue;
    CHECKS[k](v, k);
  }
  return cfg;
}

export { DEFAULTS };
