/**
 * @param {string} rule
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 * @returns {{ rule: string, severity: 'error' | 'warn', message: string, details: Record<string, unknown> }}
 */
export function issue(rule, message, details = {}) {
  return { rule, severity: 'error', message, details };
}

/**
 * Show a URL as a path when it shares the reference origin.
 * @param {string | null | undefined} url
 * @param {string | null | undefined} refOrigin
 */
export function shortUrl(url, refOrigin) {
  if (!url) return String(url);
  try {
    const u = new URL(url);
    if (refOrigin && u.origin === refOrigin) return u.pathname + u.search + u.hash;
    return u.href;
  } catch {
    return url;
  }
}
