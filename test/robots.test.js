import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseRobots, isAllowed } from '../src/checks/robots.js';

const fx = async (name) => parseRobots(await readFile(new URL(`./fixtures/robots/${name}`, import.meta.url), 'utf8'));

test('RFC 9309 example (section 5.1)', async () => {
  const r = await fx('rfc9309.txt');
  // "*" group
  assert.equal(isAllowed(r, 'https://example.com/example/page.html', 'otherbot'), false);
  assert.equal(isAllowed(r, 'https://example.com/publications/x', 'otherbot'), true);
  assert.equal(isAllowed(r, 'https://example.com/img/a.gif', 'otherbot'), false);
  assert.equal(isAllowed(r, 'https://example.com/img/a.gif?x', 'otherbot'), true);
  // foobot: disallow all except two pages
  assert.equal(isAllowed(r, 'https://example.com/', 'foobot'), false);
  assert.equal(isAllowed(r, 'https://example.com/example/page.html', 'FooBot'), true);
  assert.equal(isAllowed(r, 'https://example.com/example/allowed.gif', 'foobot'), true);
  // barbot and bazbot share one group
  assert.equal(isAllowed(r, 'https://example.com/example/page.html', 'barbot'), false);
  assert.equal(isAllowed(r, 'https://example.com/example/page.html', 'bazbot'), false);
  assert.equal(isAllowed(r, 'https://example.com/other', 'bazbot'), true);
  // quxbot group without rules: everything allowed
  assert.equal(isAllowed(r, 'https://example.com/example/page.html', 'quxbot'), true);
});

test('Google specification examples: longest match, allow wins ties, wildcards and $', async () => {
  const r = await fx('google.txt');
  assert.equal(isAllowed(r, 'https://example.com/page', 'googlebot'), true);
  assert.equal(isAllowed(r, 'https://example.com/other', 'googlebot'), false);
  assert.equal(isAllowed(r, 'https://example.com/fish.php', 'googlebot-news'), false);
  assert.equal(isAllowed(r, 'https://example.com/fishheads/catfish.php?parameters', 'googlebot-news'), false);
  assert.equal(isAllowed(r, 'https://example.com/Fish.PHP', 'googlebot-news'), true);
  // falls back to "*"
  assert.equal(isAllowed(r, 'https://example.com/', 'bingbot'), true);
  assert.equal(isAllowed(r, 'https://example.com/page.htm', 'bingbot'), false, 'disallow /*.htm is longer than allow /page');
  assert.equal(isAllowed(r, 'https://example.com/page', 'bingbot'), true);
  assert.equal(isAllowed(r, 'https://example.com/folder/page', 'bingbot'), true);
  assert.equal(isAllowed(r, 'https://example.com/x.htm', 'bingbot'), false);
  assert.equal(isAllowed(r, 'https://example.com/anything', 'bingbot'), false);
});

test('empty Disallow allows everything; no groups allows everything', () => {
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow:\n'), '/x'), true);
  assert.equal(isAllowed(parseRobots(''), '/x'), true);
  assert.equal(isAllowed(parseRobots('Disallow: /\n'), '/x'), true, 'rules before any user-agent are ignored');
});

test('robots.txt itself is always allowed', () => {
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow: /\n'), 'https://e.com/robots.txt'), true);
});

test('percent-encoding: non-ASCII patterns match encoded paths, escapes are case-insensitive', () => {
  const r = parseRobots('User-agent: *\nDisallow: /café\nDisallow: /a%3cb\n');
  assert.equal(isAllowed(r, 'https://e.com/caf%C3%A9/menu'), false);
  assert.equal(isAllowed(r, 'https://e.com/café'), false);
  assert.equal(isAllowed(r, 'https://e.com/a%3Cb'), false);
  assert.equal(isAllowed(r, 'https://e.com/cafe'), true);
});

test('query strings are matched; user-agent product token ignores version', () => {
  const r = parseRobots('User-agent: Googlebot/2.1\nDisallow: /*?sort=\n# comment\nSitemap: https://e.com/s.xml\n');
  assert.equal(isAllowed(r, 'https://e.com/list?sort=asc', 'googlebot'), false);
  assert.equal(isAllowed(r, 'https://e.com/list?page=2', 'googlebot'), true);
  assert.deepEqual(r.sitemaps, ['https://e.com/s.xml']);
});

test('groups for the same agent are merged', () => {
  const r = parseRobots('User-agent: a\nDisallow: /x\n\nUser-agent: b\nDisallow: /y\n\nUser-agent: a\nDisallow: /z\n');
  assert.equal(isAllowed(r, '/x', 'a'), false);
  assert.equal(isAllowed(r, '/z', 'a'), false);
  assert.equal(isAllowed(r, '/y', 'a'), true);
});
