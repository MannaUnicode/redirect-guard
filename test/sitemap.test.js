import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { startServer } from './helpers/fixture-server.js';
import { loadSitemap } from '../src/input/sitemap.js';
import { loadMap, sitemapEntries } from '../src/input/load-map.js';

const fxPath = (name) => fileURLToPath(new URL(`./fixtures/sitemaps/${name}`, import.meta.url));

/** @type {Awaited<ReturnType<typeof startServer>>} */
let srv;
before(async () => {
  srv = await startServer({
    '/sitemap_index.xml': (origin) => ({
      status: 200,
      headers: { 'content-type': 'application/xml' },
      body: `<sitemapindex><sitemap><loc>${origin}/child-1.xml</loc></sitemap><sitemap><loc>/child-2.xml.gz</loc></sitemap></sitemapindex>`,
    }),
    '/child-1.xml': { status: 200, body: '<urlset><url><loc>https://old.example.com/a</loc></url><url><loc>https://old.example.com/b?x=1</loc></url></urlset>' },
    '/child-2.xml.gz': (req, res) => {
      res.writeHead(200, { 'content-type': 'application/gzip' });
      res.end(gzipSync('<urlset><url><loc>https://old.example.com/c</loc></url></urlset>'));
    },
    '/moved.xml': { status: 301, headers: { location: '/child-1.xml' } },
    '/deep.xml': { status: 200, body: '<sitemapindex><sitemap><loc>/deep.xml</loc></sitemap></sitemapindex>' },
  });
});
after(() => srv.close());

test('local urlset file', async () => {
  const urls = await loadSitemap(fxPath('urlset.xml'));
  assert.equal(urls.length, 3);
});

test('local gzip file (magic bytes)', async () => {
  assert.deepEqual(await loadSitemap(fxPath('gzipped.xml.gz')), ['https://www.example.com/gz-1', 'https://www.example.com/gz-2']);
});

test('remote sitemap index with an absolute and a relative gzip child', async () => {
  const urls = await loadSitemap(`${srv.origin}/sitemap_index.xml`);
  assert.deepEqual(urls, ['https://old.example.com/a', 'https://old.example.com/b?x=1', 'https://old.example.com/c']);
});

test('remote sitemaps follow redirects', async () => {
  const urls = await loadSitemap(`${srv.origin}/moved.xml`);
  assert.equal(urls.length, 2);
});

test('non-200 and too-deep indexes are input errors', async () => {
  await assert.rejects(loadSitemap(`${srv.origin}/nope.xml`), /HTTP 404/);
  await assert.rejects(loadSitemap(`${srv.origin}/deep.xml`), /nested deeper than 3/);
  await assert.rejects(loadSitemap(fxPath('malformed.xml')), /not a sitemap/);
  await assert.rejects(loadSitemap('missing-file.xml'), /file not found/);
});

test('sitemapEntries replaces the origin with --base, keeping path and query', () => {
  const entries = sitemapEntries(['https://old.example.com/a', 'https://old.example.com/b?x=1'], { base: 'https://new.example.com', label: 'old.xml' });
  assert.deepEqual(
    entries.map((e) => [e.from, e.source, e.expected.mode]),
    [
      ['https://new.example.com/a', 'old.xml#1', 'any'],
      ['https://new.example.com/b?x=1', 'old.xml#2', 'any'],
    ],
  );
  assert.equal(sitemapEntries(['https://old.example.com/a'], { label: 'x' })[0].from, 'https://old.example.com/a');
});

test('loadMap accepts a sitemap file as a map', async () => {
  const entries = await loadMap(fxPath('gzipped.xml.gz'), { base: 'https://new.example.com' });
  assert.deepEqual(
    entries.map((e) => e.from),
    ['https://new.example.com/gz-1', 'https://new.example.com/gz-2'],
  );
});
