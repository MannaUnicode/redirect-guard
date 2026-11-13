import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, redirect, page } from './helpers/fixture-server.js';
import { diffSitemaps, diffUrlSets } from '../src/diff/sitemap-diff.js';

/** @type {Awaited<ReturnType<typeof startServer>>} */
let srv;
before(async () => {
  srv = await startServer({
    '/old.xml': {
      status: 200,
      body: '<urlset><url><loc>https://old.example.com/</loc></url><url><loc>https://old.example.com/chi-siamo</loc></url><url><loc>https://old.example.com/blog/vecchio</loc></url><url><loc>https://old.example.com/contatti</loc></url></urlset>',
    },
    '/new.xml': (origin) => ({
      status: 200,
      body: `<urlset><url><loc>${origin}/</loc></url><url><loc>${origin}/about</loc></url><url><loc>${origin}/legacy</loc></url><url><loc>${origin}/hidden</loc></url></urlset>`,
    }),
    '/': page(),
    '/about': page(),
    '/legacy': redirect('/about'),
    '/hidden': page('<meta name="robots" content="noindex">'),
    '/chi-siamo': redirect('/about'),
    // /blog/vecchio -> 404 (orphan)
    '/contatti': page(),
  });
});
after(() => srv.close());

test('diffUrlSets maps old URLs onto the new origin', () => {
  const d = diffUrlSets(['https://old.example/a', 'https://old.example/b/'], ['https://new.example/a', 'https://new.example/c'], { ignoreTrailingSlash: true });
  assert.deepEqual(d.kept, ['https://new.example/a']);
  assert.deepEqual(d.removed, ['https://new.example/b/']);
  assert.deepEqual(d.added, ['https://new.example/c']);
});

test('offline diff only computes sets', async () => {
  const r = await diffSitemaps({ old: `${srv.origin}/old.xml`, new: `${srv.origin}/new.xml`, offline: true });
  assert.equal(r.diff.kept, 1);
  assert.equal(r.diff.removed, 3);
  assert.equal(r.diff.added, 3);
  assert.equal(r.results.length, 0);
});

test('live diff: orphan-url, sitemap-url-redirects and sitemap-url-not-indexable', async () => {
  const r = await diffSitemaps({ old: `${srv.origin}/old.xml`, new: `${srv.origin}/new.xml`, retries: 0 });
  const byPath = Object.fromEntries(r.results.map((x) => [new URL(x.from).pathname + (x.role === 'new' ? ' (new)' : ''), x.issues.map((i) => i.rule)]));
  assert.deepEqual(byPath['/blog/vecchio'], ['orphan-url']);
  assert.deepEqual(byPath['/chi-siamo'], []);
  assert.deepEqual(byPath['/contatti'], [], 'a removed URL still answering 200 is not an orphan');
  assert.deepEqual(byPath['/legacy (new)'], ['sitemap-url-redirects']);
  assert.deepEqual(byPath['/hidden (new)'], ['sitemap-url-not-indexable']);
  assert.deepEqual(byPath['/about (new)'], []);
  assert.ok(r.diff.removedUrls.includes(`${srv.origin}/blog/vecchio`));
});

test('diff requires both sitemaps', async () => {
  await assert.rejects(diffSitemaps({ old: 'a.xml' }), /--old <sitemap> and --new <sitemap>/);
});
