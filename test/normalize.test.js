import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, differsOnlyByTrailingSlash, differsOnlyByQuery, isRootPath } from '../src/url/normalize.js';
import { globToRegExp, createMatcher } from '../src/url/glob.js';
import { createRewriter } from '../src/url/rewrite.js';

test('normalizeUrl: scheme/host case, default port, fragment, empty path', () => {
  assert.equal(normalizeUrl('HTTPS://WWW.Example.COM:443/a#frag'), 'https://www.example.com/a');
  assert.equal(normalizeUrl('http://example.com:80'), 'http://example.com/');
  assert.equal(normalizeUrl('http://example.com:8080/x'), 'http://example.com:8080/x');
});

test('normalizeUrl: percent-encoding', () => {
  assert.equal(normalizeUrl('https://e.com/%7euser/%2fx%3a?q=%61%2b'), 'https://e.com/~user/%2Fx%3A?q=a%2B');
});

test('normalizeUrl: IDN to punycode', () => {
  assert.equal(normalizeUrl('https://café.example/'), 'https://xn--caf-dma.example/');
});

test('normalizeUrl: options', () => {
  assert.equal(normalizeUrl('https://e.com/a/', { ignoreTrailingSlash: true }), 'https://e.com/a');
  assert.equal(normalizeUrl('https://e.com/', { ignoreTrailingSlash: true }), 'https://e.com/');
  assert.equal(normalizeUrl('https://e.com/a?b=1', { ignoreQuery: true }), 'https://e.com/a');
  assert.equal(normalizeUrl('https://e.com/a?'), 'https://e.com/a');
  assert.equal(normalizeUrl('https://e.com/a?b=2&a=1'), 'https://e.com/a?b=2&a=1', 'query order is kept');
});

test('difference helpers', () => {
  assert.equal(differsOnlyByTrailingSlash('https://e.com/a', 'https://e.com/a/'), true);
  assert.equal(differsOnlyByTrailingSlash('https://e.com/a', 'https://e.com/a'), false);
  assert.equal(differsOnlyByQuery('https://e.com/a?x=1', 'https://e.com/a'), true);
  assert.equal(isRootPath('https://e.com'), true);
  assert.equal(isRootPath('https://e.com/?x'), true);
  assert.equal(isRootPath('https://e.com/a'), false);
});

test('glob: *, ** and ?', () => {
  assert.ok(globToRegExp('/blog/*').test('/blog/post'));
  assert.ok(!globToRegExp('/blog/*').test('/blog/a/b'));
  assert.ok(globToRegExp('/blog/**').test('/blog/a/b'));
  assert.ok(globToRegExp('/blog/**').test('/blog'), 'trailing /** also matches the directory');
  assert.ok(globToRegExp('/p?').test('/p1'));
  assert.ok(globToRegExp('**/*.pdf').test('/files/a.pdf'));
  assert.ok(!globToRegExp('/a.b').test('/aXb'), 'dots are literal');
  assert.ok(globToRegExp('/search?q=*').test('/search?q=shoes'));
  const m = createMatcher(['/wp-admin/**', '/feed/**']);
  assert.ok(m('/wp-admin/edit.php'));
  assert.ok(!m('/about'));
});

test('host rewrite both ways', () => {
  const r = createRewriter({ 'https://www.example.com': 'http://127.0.0.1:9999' });
  assert.equal(r.active, true);
  assert.deepEqual(r.targets, ['http://127.0.0.1:9999']);
  assert.equal(r.toRequest('https://www.example.com/a?b=1#c'), 'http://127.0.0.1:9999/a?b=1#c');
  assert.equal(r.toRequest('https://other.example.com/a'), 'https://other.example.com/a');
  assert.equal(r.toLogical('http://127.0.0.1:9999/x'), 'https://www.example.com/x');
  assert.equal(r.toLogical('https://cdn.example.net/x'), 'https://cdn.example.net/x');
  assert.equal(createRewriter().active, false);
});
