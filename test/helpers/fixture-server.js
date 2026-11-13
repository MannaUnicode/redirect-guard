import { createServer } from 'node:http';

/**
 * @typedef {{ status?: number, headers?: Record<string, string>, body?: string, html?: string }} RouteSpec
 * @typedef {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, ctx: { count: number, origin: string }) => void} RouteHandler
 */

/**
 * Start a local HTTP server on 127.0.0.1:0. No side effects at import time.
 * Routes are keyed by "path?query" (exact), then by path. A route value is a
 * spec object or a handler function. Unknown routes answer 404.
 * `origin` is http://127.0.0.1:PORT and `altOrigin` http://localhost:PORT,
 * two distinct hosts for host and header-scoping tests.
 * @param {Record<string, RouteSpec | RouteHandler | ((origin: string) => RouteSpec)>} routes
 */
export async function startServer(routes = {}) {
  /** @type {{ method: string, url: string, host: string, headers: import('node:http').IncomingHttpHeaders }[]} */
  const requests = [];
  /** @type {Map<string, number>} */
  const counts = new Map();
  let origin = '';
  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    requests.push({ method: req.method ?? 'GET', url, host: req.headers.host ?? '', headers: req.headers });
    const path = url.split('?')[0];
    const key = url in routes ? url : path;
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    const route = routes[key];
    if (!route) {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<html><head><title>Not found</title></head><body>404</body></html>');
      return;
    }
    if (typeof route === 'function' && route.length >= 2) {
      /** @type {RouteHandler} */ (route)(req, res, { count: n, origin });
      return;
    }
    const spec = typeof route === 'function' ? /** @type {any} */ (route)(origin) : route;
    const headers = { ...(spec.headers ?? {}) };
    let body = spec.body ?? '';
    if (spec.html !== undefined) {
      headers['content-type'] = headers['content-type'] ?? 'text/html; charset=utf-8';
      body = spec.html.includes('<html') ? spec.html : `<!doctype html><html><head>${spec.html}</head><body>ok</body></html>`;
    }
    res.writeHead(spec.status ?? 200, headers);
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
  origin = `http://127.0.0.1:${addr.port}`;
  return {
    origin,
    altOrigin: `http://localhost:${addr.port}`,
    port: addr.port,
    requests,
    /** @param {string} key */
    count: (key) => counts.get(key) ?? 0,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve(undefined));
      }),
  };
}

/** A page that answers 200 with a self canonical. @param {string} [extraHead] */
export function page(extraHead = '') {
  return { status: 200, html: extraHead };
}

/** @param {string} location @param {number} [status] */
export function redirect(location, status = 301) {
  return { status, headers: { location } };
}
