const UNRESERVED = /^[A-Za-z0-9\-._~]$/;

/**
 * Decode percent-escapes of unreserved characters and uppercase the rest.
 * @param {string} s
 */
export function fixPercentEncoding(s) {
  return s.replace(/%([0-9a-fA-F]{2})/g, (_m, hex) => {
    const ch = String.fromCharCode(parseInt(hex, 16));
    return UNRESERVED.test(ch) ? ch : `%${hex.toUpperCase()}`;
  });
}

/**
 * Normalize a URL for comparison. Reports always show the raw URL.
 * - lowercase scheme/host, default port removed, IDN to punycode (done by WHATWG URL)
 * - unreserved percent-escapes decoded, other escapes uppercased
 * - fragment removed, empty path becomes "/"
 * - optional: trailing slash removed (except root), query removed
 * @param {string | URL} input
 * @param {{ ignoreTrailingSlash?: boolean, ignoreQuery?: boolean }} [opts]
 */
export function normalizeUrl(input, opts = {}) {
  const u = new URL(String(input));
  let path = fixPercentEncoding(u.pathname) || '/';
  if (opts.ignoreTrailingSlash && path.length > 1 && path.endsWith('/')) {
    path = path.replace(/\/+$/, '') || '/';
  }
  let search = opts.ignoreQuery ? '' : fixPercentEncoding(u.search);
  if (search === '?') search = '';
  return `${u.protocol}//${u.host}${path}${search}`;
}

/** @param {string} url */
export function pathAndSearch(url) {
  const u = new URL(url);
  return u.pathname + u.search;
}

/** True when two URLs differ only by a trailing slash on the path. */
export function differsOnlyByTrailingSlash(a, b) {
  const na = normalizeUrl(a);
  const nb = normalizeUrl(b);
  return na !== nb && normalizeUrl(a, { ignoreTrailingSlash: true }) === normalizeUrl(b, { ignoreTrailingSlash: true });
}

/** True when two URLs differ only by their query string. */
export function differsOnlyByQuery(a, b) {
  const na = normalizeUrl(a);
  const nb = normalizeUrl(b);
  return na !== nb && normalizeUrl(a, { ignoreQuery: true }) === normalizeUrl(b, { ignoreQuery: true });
}

/** @param {string} url */
export function isRootPath(url) {
  const u = new URL(url);
  return u.pathname === '/' || u.pathname === '';
}

/** @param {string} s */
export function isAbsoluteUrl(s) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s.trim());
}
