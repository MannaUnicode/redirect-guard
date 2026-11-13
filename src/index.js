// Public library entry. Re-exports only; see types/index.d.ts.
export { check } from './check.js';
export { diffSitemaps } from './diff/sitemap-diff.js';
export { loadMap } from './input/load-map.js';
export { loadSitemap } from './input/sitemap.js';
export { traceRedirects } from './http/trace.js';
export { parseRobots, isAllowed } from './checks/robots.js';
export { extractHeadSignals } from './parse/html-head.js';
export { normalizeUrl } from './url/normalize.js';
export { formatReport } from './report/format.js';
export { exitCodeFor } from './engine.js';
export { RULES } from './checks/rules.js';
export { version } from './version.js';
export { UsageError, ConfigError, InputError } from './errors.js';

/**
 * Identity helper for typed `redirect-guard.config.mjs` files.
 * @template T
 * @param {T} config
 * @returns {T}
 */
export function defineConfig(config) {
  return config;
}
