import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseSitemapXml } from '../src/parse/xml.js';
import { decodeEntities } from '../src/parse/entities.js';

const fx = (name) => new URL(`./fixtures/sitemaps/${name}`, import.meta.url);

test('urlset: comments and image:loc ignored, whitespace trimmed, entities decoded', async () => {
  const { type, locs } = parseSitemapXml(await readFile(fx('urlset.xml'), 'utf8'));
  assert.equal(type, 'urlset');
  assert.deepEqual(locs, ['https://www.example.com/', 'https://www.example.com/chi-siamo', 'https://www.example.com/search?q=a&b=c']);
});

test('CDATA and numeric/named entities', async () => {
  const { locs } = parseSitemapXml(await readFile(fx('cdata-entities.xml'), 'utf8'));
  assert.deepEqual(locs, ['https://www.example.com/a?x=1&y=2', 'https://www.example.com/café', "https://www.example.com/q's"]);
});

test('sitemap index is recognised', async () => {
  const { type, locs } = parseSitemapXml(await readFile(fx('index.xml'), 'utf8'));
  assert.equal(type, 'sitemapindex');
  assert.equal(locs.length, 2);
});

test('namespace-prefixed root is accepted', () => {
  const { type, locs } = parseSitemapXml('<sm:urlset xmlns:sm="x"><sm:url><loc>https://a.example/</loc></sm:url></sm:urlset>');
  assert.equal(type, 'urlset');
  assert.deepEqual(locs, ['https://a.example/']);
});

test('not a sitemap and malformed loc are input errors', async () => {
  const malformed = await readFile(fx('malformed.xml'), 'utf8');
  assert.throws(() => parseSitemapXml(malformed, 'x.xml'), /not a sitemap/);
  assert.throws(() => parseSitemapXml('<urlset><url><loc>https://a/<b></loc></url></urlset>'), /malformed <loc>/);
  assert.throws(() => parseSitemapXml('<urlset><url><loc>https://a/</url></urlset>'), /unterminated/);
});

test('decodeEntities leaves unknown entities alone', () => {
  assert.equal(decodeEntities('a &amp; b &foo; &#x41;&#66; &#xZZ;'), 'a & b &foo; AB &#xZZ;');
});
