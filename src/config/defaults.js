/**
 * Default options. Single source of truth, mirrored in docs/configuration.md
 * and schema/config.schema.json.
 */
export const DEFAULTS = Object.freeze({
  base: null,
  map: null,
  sitemap: null,
  hostRewrite: Object.freeze({}),
  expectStatus: Object.freeze([301, 308]),
  maxHops: 1,
  maxRedirects: 10,
  concurrency: 4,
  delay: 0,
  timeout: 15000,
  retries: 2,
  userAgent: null,
  headers: Object.freeze({}),
  robotsAgent: 'googlebot',
  indexability: true,
  robots: true,
  ignoreTrailingSlash: false,
  ignoreQuery: false,
  preserveQuery: false,
  collapseThreshold: 10,
  include: Object.freeze([]),
  exclude: Object.freeze([]),
  limit: null,
  failOn: 'error',
  rules: Object.freeze({}),
  overrides: Object.freeze([]),
  reporters: Object.freeze(['text']),
  maxBodyBytes: 524288,
});

/** Keys an `overrides[]` item may set besides `match`. */
export const OVERRIDE_KEYS = Object.freeze([
  'maxHops',
  'expectStatus',
  'rules',
  'ignoreTrailingSlash',
  'ignoreQuery',
  'preserveQuery',
  'indexability',
  'robots',
  'collapseThreshold',
]);
