import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as api from '../src/index.js';
import { startServer, redirect, page } from './helpers/fixture-server.js';

const EXPECTED_EXPORTS = [
  'check',
  'diffSitemaps',
  'loadMap',
  'loadSitemap',
  'traceRedirects',
  'parseRobots',
  'isAllowed',
  'extractHeadSignals',
  'normalizeUrl',
  'formatReport',
  'defineConfig',
  'exitCodeFor',
  'RULES',
  'version',
  'UsageError',
  'ConfigError',
  'InputError',
];

/** @type {Awaited<ReturnType<typeof startServer>>} */
let srv;
before(async () => {
  srv = await startServer({ '/a': redirect('/b'), '/b': page(), '/c': redirect('/b', 302) });
});
after(() => srv.close());

test('public exports exist and nothing else is exported', () => {
  assert.deepEqual(Object.keys(api).sort(), [...EXPECTED_EXPORTS].sort());
});

test('every runtime export is declared in types/index.d.ts', async () => {
  const dts = await readFile(new URL('../types/index.d.ts', import.meta.url), 'utf8');
  for (const name of EXPECTED_EXPORTS) {
    assert.match(dts, new RegExp(`export (declare )?(function|const|class) ${name}\\b`), name);
  }
});

test('zero runtime dependencies', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
  assert.equal(pkg.version, api.version);
});

test('check() returns a report; exitCodeFor and formatReport work on it', async () => {
  const report = await api.check({ base: srv.origin, entries: [{ from: '/a', to: '/b' }, { from: '/c', to: '/b' }], retries: 0 });
  assert.equal(report.summary.total, 2);
  assert.equal(api.exitCodeFor(report), 1);
  assert.equal(api.exitCodeFor({ summary: { fail: 0, warn: 1 } }, 'warn'), 1);
  assert.equal(api.exitCodeFor({ summary: { fail: 0, warn: 1 } }), 0);
  assert.match(api.formatReport(report, 'markdown'), /redirect-guard: 1 failing/);
  assert.equal(api.defineConfig({ maxHops: 2 }).maxHops, 2);
});

test('the library never writes to stdout/stderr or touches process.exitCode (only src/cli does)', async () => {
  const { readdir } = await import('node:fs/promises');
  const root = new URL('../src/', import.meta.url);
  const files = (await readdir(root, { recursive: true })).filter((f) => f.endsWith('.js') && !f.startsWith('cli'));
  for (const f of files) {
    const src = await readFile(new URL(f, root), 'utf8');
    assert.ok(!/console\.|process\.(stdout|stderr|exitCode|exit\()/.test(src), f);
  }
});

test('check() validates options and throws typed errors', async () => {
  await assert.rejects(api.check({ concurrency: 100, entries: [] }), (err) => err instanceof api.ConfigError && err.code === 'ERR_CONFIG');
  await assert.rejects(api.check({}), (err) => err instanceof api.UsageError && err.code === 'ERR_USAGE');
  await assert.rejects(api.check({ map: 'nope.csv' }), (err) => err instanceof api.InputError && err.code === 'ERR_INPUT');
});

test('check() accepts an injected fetch and an AbortSignal', async () => {
  let calls = 0;
  const fakeFetch = async (url) => {
    calls++;
    if (String(url).endsWith('/robots.txt')) return new Response('', { status: 404 });
    if (String(url).endsWith('/old')) return new Response(null, { status: 301, headers: { location: '/new' } });
    return new Response('<html><head></head></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const r = await api.check({ base: 'https://shop.example', entries: [{ from: '/old', to: '/new' }], fetch: /** @type {any} */ (fakeFetch) });
  assert.equal(r.results[0].status, 'ok');
  assert.ok(calls >= 3);
  const ac = new AbortController();
  ac.abort(new Error('cancelled'));
  await assert.rejects(api.check({ base: srv.origin, entries: [{ from: '/a', to: '/b' }], signal: ac.signal }), /cancelled/);
});

test('onProgress reports done/total', async () => {
  const seen = [];
  await api.check({ base: srv.origin, entries: [{ from: '/a', to: '/b' }, { from: '/c', to: '/b' }], retries: 0, onProgress: (d, t) => seen.push(`${d}/${t}`) });
  assert.deepEqual(seen.sort(), ['1/2', '2/2']);
});

test('traceRedirects and helpers are usable standalone', async () => {
  const t = await api.traceRedirects(`${srv.origin}/a`);
  assert.equal(t.chain.length, 2);
  assert.equal(api.normalizeUrl('HTTP://A.example:80/x#y'), 'http://a.example/x');
  assert.equal(api.isAllowed(api.parseRobots('User-agent: *\nDisallow: /p'), 'https://a/p/1'), false);
  assert.equal(api.extractHeadSignals('<link rel=canonical href=/x>').canonical, '/x');
  assert.equal(api.RULES['wrong-destination'].severity, 'error');
  assert.throws(() => {
    // @ts-ignore
    api.RULES['wrong-destination'].severity = 'off';
  });
});
