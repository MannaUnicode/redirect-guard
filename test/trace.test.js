import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, redirect, page } from './helpers/fixture-server.js';
import { traceRedirects } from '../src/http/trace.js';
import { request } from '../src/http/request.js';
import { createRewriter } from '../src/url/rewrite.js';

/** @type {Awaited<ReturnType<typeof startServer>>} */
let srv;
const noSleep = async () => {};

before(async () => {
  srv = await startServer({
    '/a': redirect('/b'),
    '/b': redirect('/c', 302),
    '/c': page(),
    '/loop1': redirect('/loop2'),
    '/loop2': redirect('/loop1'),
    '/r1': redirect('/r2'),
    '/r2': redirect('/r3'),
    '/r3': redirect('/r4'),
    '/r4': page(),
    '/frag': redirect('/c#section'),
    '/no-location': { status: 301 },
    '/mailto': redirect('mailto:someone@example.com'),
    '/big': { status: 200, headers: { 'content-type': 'text/html' }, body: `<html><head><meta name="robots" content="noindex"></head>${'x'.repeat(200000)}` },
    '/json': { status: 200, headers: { 'content-type': 'application/json' }, body: '{"a":1}' },
    '/slow': (req, res) => {
      setTimeout(() => {
        res.writeHead(200);
        res.end('late');
      }, 500);
    },
    '/reset': (req, res) => {
      res.socket?.destroy();
    },
    '/abs-alt': (req, res, ctx) => {
      res.writeHead(301, { location: `${ctx.origin.replace('127.0.0.1', 'localhost')}/c` });
      res.end();
    },
  });
});
after(() => srv.close());

test('fetch with redirect: "manual" exposes the real 3xx status and Location', async () => {
  const res = await request(`${srv.origin}/a`);
  assert.equal(res.status, 301);
  assert.equal(res.location, '/b');
});

test('follows every hop and records the chain', async () => {
  const t = await traceRedirects(`${srv.origin}/a`, { sleep: noSleep });
  assert.deepEqual(
    t.chain.map((h) => [new URL(h.url).pathname, h.status, h.location]),
    [
      ['/a', 301, '/b'],
      ['/b', 302, '/c'],
      ['/c', 200, null],
    ],
  );
  assert.equal(t.final?.status, 200);
  assert.equal(t.chain[0].attempts, 1);
  assert.equal(t.chain[0].locationRelative, true);
  assert.equal(typeof t.chain[0].durationMs, 'number');
  assert.equal(t.loop, false);
});

test('detects loops', async () => {
  const t = await traceRedirects(`${srv.origin}/loop1`, { sleep: noSleep });
  assert.equal(t.loop, true);
  assert.equal(t.final, null);
  assert.equal(t.chain.length, 2);
});

test('stops at maxRedirects', async () => {
  const t = await traceRedirects(`${srv.origin}/r1`, { maxRedirects: 2, sleep: noSleep });
  assert.equal(t.tooMany, true);
  assert.equal(t.chain.length, 3);
  const ok = await traceRedirects(`${srv.origin}/r1`, { maxRedirects: 3, sleep: noSleep });
  assert.equal(ok.tooMany, false);
  assert.equal(ok.final?.status, 200);
});

test('a fragment in Location is kept in the chain and ignored for the request', async () => {
  const t = await traceRedirects(`${srv.origin}/frag`, { sleep: noSleep });
  assert.equal(t.final?.url, `${srv.origin}/c#section`);
  assert.equal(t.final?.status, 200);
  assert.ok(srv.requests.some((r) => r.url === '/c'));
});

test('3xx without Location and non-http Location end the chain', async () => {
  const a = await traceRedirects(`${srv.origin}/no-location`, { sleep: noSleep });
  assert.equal(a.final?.status, 301);
  const b = await traceRedirects(`${srv.origin}/mailto`, { sleep: noSleep });
  assert.equal(b.final?.status, 301);
});

test('the final body is read only for HTML and capped', async () => {
  const t = await traceRedirects(`${srv.origin}/big`, { maxBodyBytes: 4096, sleep: noSleep });
  assert.equal(t.final?.body?.length, 4096);
  const j = await traceRedirects(`${srv.origin}/json`, { sleep: noSleep });
  assert.equal(j.final?.body, null);
  const off = await traceRedirects(`${srv.origin}/big`, { readBody: false, sleep: noSleep });
  assert.equal(off.final?.body, null);
});

test('timeouts become request errors with attempts', async () => {
  const t = await traceRedirects(`${srv.origin}/slow`, { timeout: 100, retries: 1, sleep: noSleep });
  assert.equal(t.error?.code, 'ETIMEDOUT');
  assert.equal(t.chain[0].attempts, 2);
  assert.equal(t.chain[0].status, null);
});

test('connection resets are retried and reported', async () => {
  const before = srv.count('/reset');
  const t = await traceRedirects(`${srv.origin}/reset`, { retries: 2, sleep: noSleep });
  assert.ok(t.error);
  assert.equal(srv.count('/reset') - before, 3);
  assert.equal(t.chain[0].attempts, 3);
});

test('DNS and TLS errors from an injected fetch are not retried', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    const err = new TypeError('fetch failed');
    // @ts-ignore
    err.cause = Object.assign(new Error('getaddrinfo ENOTFOUND nope.invalid'), { code: 'ENOTFOUND' });
    throw err;
  };
  const t = await traceRedirects('https://nope.invalid/', { fetch: /** @type {any} */ (fakeFetch), sleep: noSleep });
  assert.equal(t.error?.code, 'ENOTFOUND');
  assert.equal(calls, 1);
  const tls = await traceRedirects('https://expired.invalid/', {
    fetch: /** @type {any} */ (
      async () => {
        throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' }) });
      }
    ),
    sleep: noSleep,
  });
  assert.equal(tls.error?.code, 'CERT_HAS_EXPIRED');
});

test('host rewrite: requests go to B, the chain stays in A, Location on B maps back to A', async () => {
  const rewriter = createRewriter({ 'https://www.example.com': srv.origin });
  const t = await traceRedirects('https://www.example.com/a', { rewriter, sleep: noSleep });
  assert.deepEqual(
    t.chain.map((h) => h.url),
    ['https://www.example.com/a', 'https://www.example.com/b', 'https://www.example.com/c'],
  );
  assert.equal(t.chain[0].requestedUrl, `${srv.origin}/a`);
  assert.equal(t.final?.requestedUrl, `${srv.origin}/c`);
});

test('custom headers are sent only to in-scope origins', async () => {
  const marker = `secret-${Math.random()}`;
  const start = srv.requests.length;
  await traceRedirects(`${srv.origin}/abs-alt`, {
    headers: { Authorization: marker },
    inScope: new Set([srv.origin]),
    sleep: noSleep,
  });
  const seen = srv.requests.slice(start);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].headers.authorization, marker, 'in-scope origin receives the header');
  assert.match(seen[1].host, /^localhost:/);
  assert.equal(seen[1].headers.authorization, undefined, 'other origin does not');
  assert.match(String(seen[0].headers['user-agent']), /^redirect-guard\//);
});
