import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, redirect, page } from './helpers/fixture-server.js';
import { check } from '../src/check.js';
import { RULES } from '../src/checks/rules.js';

const PROD = 'https://www.example.com';
/** @type {Awaited<ReturnType<typeof startServer>>} */
let srv;
/** @type {Awaited<ReturnType<typeof startServer>>} */
let broken;
const noSleep = async () => {};

before(async () => {
  srv = await startServer({
    '/robots.txt': { status: 200, headers: { 'content-type': 'text/plain' }, body: 'User-agent: *\nDisallow: /private/\n' },
    '/ok': page(),
    '/ok/': page(),
    '/other': page(),
    '/': page(),
    '/page200': page(),
    '/perm': redirect('/ok'),
    '/temp': redirect('/ok', 302),
    '/h1': redirect('/h2'),
    '/h2': redirect('/ok', 302),
    '/two-hops': redirect('/h3'),
    '/h3': redirect('/ok'),
    '/slash': redirect('/ok/'),
    '/ts': redirect('/ts-target'),
    '/ts-target': redirect('/ts-target/'),
    '/ts-target/': page(),
    '/loop1': redirect('/loop2'),
    '/loop2': redirect('/loop1'),
    '/c1': redirect('/c2'),
    '/c2': redirect('/c3'),
    '/c3': redirect('/c4'),
    '/c4': page(),
    '/removed': { status: 410 },
    '/still': page(),
    '/to404': redirect('/missing'),
    '/to-noindex': redirect('/noindex'),
    '/noindex': page('<meta name="robots" content="noindex, follow">'),
    '/to-xrt': redirect('/xrt'),
    '/xrt': { status: 200, headers: { 'x-robots-tag': 'googlebot: noindex, nofollow', 'content-type': 'text/html' }, body: '<html></html>' },
    '/to-xrt-bing': redirect('/xrt-bing'),
    '/xrt-bing': { status: 200, headers: { 'x-robots-tag': 'bingbot: noindex', 'content-type': 'text/html' }, body: '<html></html>' },
    '/to-canon': redirect('/canon'),
    '/canon': page('<link rel="canonical" href="/elsewhere">'),
    '/to-canon-self': redirect('/canon-self'),
    '/canon-self': page('<link rel="canonical" href="https://www.example.com/canon-self">'),
    '/to-canon-header': redirect('/canon-header'),
    '/canon-header': { status: 200, headers: { link: '<https://www.example.com/hdr>; rel="canonical"', 'content-type': 'text/html' }, body: '<html><head><link rel="canonical" href="/canon-header"></head></html>' },
    '/to-private': redirect('/private/page'),
    '/private/page': page(),
    '/deep/page': redirect('/'),
    '/q': redirect('/ok'),
    '/to-http': redirect('http://www.example.com/http-page'),
    '/http-page': page(),
    '/to-nowww': redirect('https://example.com/nowww'),
    '/nowww': page(),
    '/reset': (req, res) => {
      res.socket?.destroy();
    },
    '/collapse-a': redirect('/'),
    '/collapse-b': redirect('/'),
    '/collapse-c': redirect('/'),
  });
  broken = await startServer({
    '/robots.txt': { status: 503 },
    '/x': redirect('/y'),
    '/y': page(),
  });
});
after(async () => {
  await srv.close();
  await broken.close();
});

/**
 * Run check() against the fixture server in production space.
 * @param {any[]} entries
 * @param {Record<string, any>} [extra]
 */
async function run(entries, extra = {}) {
  return check({
    base: PROD,
    hostRewrite: {
      [PROD]: srv.origin,
      'http://www.example.com': srv.altOrigin,
      'https://example.com': srv.altOrigin,
    },
    retries: 0,
    sleep: noSleep,
    entries,
    ...extra,
  });
}

/** @param {any} report @param {number} i */
const rules = (report, i = 0) => report.results[i].issues.map((x) => x.rule);

test('every rule has a description, docs URL and a valid default severity', () => {
  for (const [id, r] of Object.entries(RULES)) {
    assert.ok(r.description.length > 10, id);
    assert.ok(['error', 'warn', 'off'].includes(r.severity), id);
    assert.ok(r.docsUrl.endsWith(`#${id}`), id);
  }
});

test('a correct permanent redirect passes with full indexability info', async () => {
  const r = await run([{ from: '/perm', to: '/ok' }]);
  assert.equal(r.results[0].status, 'ok');
  assert.deepEqual(rules(r), []);
  assert.equal(r.results[0].final.indexability.robotsAllowed, true);
  assert.equal(r.results[0].chain[0].requestedUrl, `${srv.origin}/perm`);
  assert.equal(r.results[0].from, `${PROD}/perm`);
});

test('request-failed fires on connection errors', async () => {
  const r = await run([{ from: '/reset', to: '/ok' }]);
  assert.deepEqual(rules(r), ['request-failed']);
  assert.equal(r.results[0].status, 'fail');
});

test('redirect-loop and too-many-redirects', async () => {
  const r = await run([{ from: '/loop1', to: '/ok' }, { from: '/c1', to: '/c4' }], { maxRedirects: 2 });
  assert.deepEqual(rules(r, 0), ['redirect-loop']);
  assert.deepEqual(rules(r, 1), ['too-many-redirects']);
  const ok = await run([{ from: '/c1', to: '/c4' }], { maxRedirects: 5, maxHops: 3 });
  assert.deepEqual(rules(ok), []);
});

test('no-redirect fires on a direct 200; a direct 404 is target-not-ok', async () => {
  const r = await run([{ from: '/page200', to: '/ok' }, { from: '/nothing', to: '/ok' }]);
  assert.deepEqual(rules(r, 0), ['no-redirect']);
  assert.deepEqual(rules(r, 1), ['target-not-ok']);
  assert.match(r.results[1].issues[0].message, /Answers 404, no redirect to \/ok/);
});

test('status-not-permanent on hop 1 and on a later hop', async () => {
  const r = await run([{ from: '/temp', to: '/ok' }, { from: '/h1', to: '/ok' }], { maxHops: 2 });
  assert.deepEqual(rules(r, 0), ['status-not-permanent']);
  assert.equal(r.results[0].issues[0].message, 'Hop 1 returned 302, expected 301 or 308');
  assert.deepEqual(rules(r, 1), ['status-not-permanent']);
  assert.deepEqual(r.results[1].issues[0].details.hops, [2]);
  const tolerant = await run([{ from: '/temp', to: '/ok', status: 'temporary' }]);
  assert.deepEqual(rules(tolerant), []);
  const viaOption = await run([{ from: '/temp', to: '/ok' }], { expectStatus: [301, 302] });
  assert.deepEqual(rules(viaOption), []);
});

test('wrong-destination, with a trailing-slash hint, and ignoreTrailingSlash', async () => {
  const r = await run([{ from: '/perm', to: '/other' }, { from: '/slash', to: '/ok' }]);
  assert.deepEqual(rules(r, 0), ['wrong-destination']);
  assert.equal(r.results[0].issues[0].message, 'Ends at /ok, expected /other');
  assert.deepEqual(rules(r, 1), ['wrong-destination']);
  assert.match(r.results[1].issues[0].message, /differs only by the trailing slash/);
  const relaxed = await run([{ from: '/slash', to: '/ok' }], { ignoreTrailingSlash: true });
  assert.deepEqual(rules(relaxed), []);
});

test('mode gone: 410 passes, 200 is unexpected-status', async () => {
  const r = await run([
    { from: '/removed', status: 410 },
    { from: '/still', status: 410 },
  ]);
  assert.deepEqual(rules(r, 0), []);
  assert.deepEqual(rules(r, 1), ['unexpected-status']);
  assert.equal(r.results[1].issues[0].message, 'Expected 410 (gone), got 200');
});

test('mode present: 200 passes, a redirect is unexpected-status', async () => {
  const r = await run([
    { from: '/ok', status: 200 },
    { from: '/perm', status: 200 },
  ]);
  assert.deepEqual(rules(r, 0), []);
  assert.deepEqual(rules(r, 1), ['unexpected-status']);
});

test('target-not-ok when the chain ends on a 404', async () => {
  const r = await run([{ from: '/to404', to: '/missing' }]);
  assert.deepEqual(rules(r), ['target-not-ok']);
});

test('target-noindex from meta robots and from an agent-prefixed X-Robots-Tag', async () => {
  const r = await run([
    { from: '/to-noindex', to: '/noindex' },
    { from: '/to-xrt', to: '/xrt' },
    { from: '/to-xrt-bing', to: '/xrt-bing' },
  ]);
  assert.deepEqual(rules(r, 0), ['target-noindex']);
  assert.equal(r.results[0].issues[0].message, '<meta name="robots" content="noindex, follow">');
  assert.deepEqual(rules(r, 1), ['target-noindex']);
  assert.deepEqual(rules(r, 2), [], 'a bingbot-only noindex does not apply to googlebot');
  const bing = await run([{ from: '/to-xrt-bing', to: '/xrt-bing' }], { robotsAgent: 'bingbot' });
  assert.deepEqual(rules(bing), ['target-noindex']);
  const off = await run([{ from: '/to-noindex', to: '/noindex' }], { indexability: false });
  assert.deepEqual(rules(off), []);
});

test('canonical-mismatch: HTML canonical elsewhere fires, self canonical passes, Link header wins', async () => {
  const r = await run([
    { from: '/to-canon', to: '/canon' },
    { from: '/to-canon-self', to: '/canon-self' },
    { from: '/to-canon-header', to: '/canon-header' },
  ]);
  assert.deepEqual(rules(r, 0), ['canonical-mismatch']);
  assert.equal(r.results[0].issues[0].message, 'Canonical points to /elsewhere');
  assert.deepEqual(rules(r, 1), []);
  assert.deepEqual(rules(r, 2), ['canonical-mismatch']);
  assert.equal(r.results[2].issues[0].details.source, 'Link header');
});

test('robots-blocked uses the destination robots.txt, --no-robots disables it', async () => {
  const r = await run([{ from: '/to-private', to: '/private/page' }]);
  assert.deepEqual(rules(r), ['robots-blocked']);
  assert.equal(r.results[0].final.indexability.robotsAllowed, false);
  const off = await run([{ from: '/to-private', to: '/private/page' }], { robots: false });
  assert.deepEqual(rules(off), []);
});

test('robots-unreachable warns when robots.txt answers 5xx', async () => {
  const r = await check({ base: broken.origin, entries: [{ from: '/x', to: '/y' }], retries: 0, sleep: noSleep });
  assert.deepEqual(rules(r), ['robots-unreachable']);
  assert.equal(r.results[0].status, 'warn');
});

test('chain-too-long and trailing-slash-hop are warnings', async () => {
  const r = await run([{ from: '/two-hops', to: '/ok' }, { from: '/ts', to: '/ts-target/' }]);
  assert.deepEqual(rules(r, 0), ['chain-too-long']);
  assert.equal(r.results[0].status, 'warn');
  assert.deepEqual(rules(r, 1), ['chain-too-long', 'trailing-slash-hop']);
  const ok = await run([{ from: '/two-hops', to: '/ok' }], { maxHops: 2 });
  assert.deepEqual(rules(ok), []);
});

test('redirect-to-homepage fires unless the homepage is expected', async () => {
  const r = await run([{ from: '/deep/page' }, { from: '/deep/page', to: '/' }].slice(0, 1));
  assert.deepEqual(rules(r), ['redirect-to-homepage']);
  const expected = await run([{ from: '/deep/page', to: '/' }]);
  assert.deepEqual(rules(expected), []);
});

test('redirect-collapse groups many URLs ending at one page', async () => {
  const entries = [{ from: '/collapse-a' }, { from: '/collapse-b' }, { from: '/collapse-c' }];
  const r = await run(entries, { collapseThreshold: 3, rules: { 'redirect-to-homepage': 'off' } });
  assert.deepEqual(r.groups.collapse, [{ target: `${PROD}/`, count: 3, ids: [1, 2, 3] }]);
  for (let i = 0; i < 3; i++) assert.deepEqual(rules(r, i), ['redirect-collapse']);
  const below = await run(entries, { collapseThreshold: 4, rules: { 'redirect-to-homepage': 'off' } });
  assert.deepEqual(below.groups.collapse, []);
  assert.deepEqual(rules(below), []);
});

test('query-dropped in mode any, or with preserveQuery', async () => {
  const r = await run([{ from: '/q?id=3' }]);
  assert.deepEqual(rules(r), ['query-dropped']);
  const redirectMode = await run([{ from: '/q?id=3', to: '/ok' }]);
  assert.deepEqual(rules(redirectMode), []);
  const preserve = await run([{ from: '/q?id=3', to: '/ok' }], { preserveQuery: true });
  assert.deepEqual(rules(preserve), ['query-dropped']);
});

test('protocol-inconsistent and host-inconsistent', async () => {
  const r = await run([{ from: '/to-http' }, { from: '/to-nowww' }]);
  assert.deepEqual(rules(r, 0), ['protocol-inconsistent']);
  assert.equal(r.results[0].final.url, 'http://www.example.com/http-page');
  assert.deepEqual(rules(r, 1), ['host-inconsistent']);
  const same = await run([{ from: '/perm' }]);
  assert.deepEqual(rules(same), []);
});

test('location-relative is off by default and can be enabled', async () => {
  const off = await run([{ from: '/perm', to: '/ok' }]);
  assert.deepEqual(rules(off), []);
  const on = await run([{ from: '/perm', to: '/ok' }], { rules: { 'location-relative': 'warn' } });
  assert.deepEqual(rules(on), ['location-relative']);
});

test('rule severities can be raised or turned off; overrides apply by glob', async () => {
  const raised = await run([{ from: '/two-hops', to: '/ok' }], { rules: { 'chain-too-long': 'error' } });
  assert.equal(raised.results[0].status, 'fail');
  const off = await run([{ from: '/temp', to: '/ok' }], { rules: { 'status-not-permanent': 'off' } });
  assert.equal(off.results[0].status, 'ok');
  const over = await run([{ from: '/two-hops', to: '/ok' }, { from: '/ts', to: '/ts-target/' }], {
    overrides: [{ match: '/two-*', maxHops: 2 }],
  });
  assert.deepEqual(rules(over, 0), []);
  assert.ok(rules(over, 1).includes('chain-too-long'));
});

test('results keep input order under concurrency', async () => {
  const entries = ['/perm', '/c1', '/temp', '/ok', '/h1', '/two-hops', '/slash', '/to-noindex'].map((from) => ({ from }));
  const r = await run(entries, { concurrency: 8, maxRedirects: 10 });
  assert.deepEqual(
    r.results.map((x) => x.from),
    entries.map((e) => `${PROD}${e.from}`),
  );
  assert.deepEqual(
    r.results.map((x) => x.id),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
});

test('summary counts and byRule', async () => {
  const r = await run([{ from: '/perm', to: '/ok' }, { from: '/temp', to: '/ok' }, { from: '/two-hops', to: '/ok' }]);
  assert.deepEqual(
    { total: r.summary.total, ok: r.summary.ok, warn: r.summary.warn, fail: r.summary.fail },
    { total: 3, ok: 1, warn: 1, fail: 1 },
  );
  assert.deepEqual(r.summary.byRule, { 'status-not-permanent': 1, 'chain-too-long': 1 });
});
