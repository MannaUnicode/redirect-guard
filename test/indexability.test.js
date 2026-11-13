import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseXRobotsTag, parseLinkCanonical, analyzeDestination } from '../src/checks/indexability.js';
import { destinationIssue } from '../src/checks/destination.js';
import { applyHeuristics } from '../src/checks/heuristics.js';

test('X-Robots-Tag: global, agent-prefixed, value directives', () => {
  assert.deepEqual(parseXRobotsTag('noindex, nofollow', 'googlebot'), ['noindex', 'nofollow']);
  assert.deepEqual(parseXRobotsTag('googlebot: noindex', 'googlebot'), ['noindex']);
  assert.deepEqual(parseXRobotsTag('otherbot: noindex, nofollow', 'googlebot'), []);
  assert.deepEqual(parseXRobotsTag('max-snippet: 20, noarchive', 'googlebot'), ['max-snippet: 20', 'noarchive']);
  assert.deepEqual(parseXRobotsTag('unavailable_after: 25 Jun 2030 15:00:00 PST', 'googlebot'), ['unavailable_after: 25 jun 2030 15:00:00 pst']);
  assert.deepEqual(parseXRobotsTag(null, 'googlebot'), []);
});

test('Link header canonical', () => {
  assert.equal(parseLinkCanonical('<https://e.com/a>; rel="canonical"'), 'https://e.com/a');
  assert.equal(parseLinkCanonical('<https://e.com/p.pdf>; rel=alternate, <https://e.com/b>; rel=canonical'), 'https://e.com/b');
  assert.equal(parseLinkCanonical('<https://e.com/x>; rel="preload"'), null);
  assert.equal(parseLinkCanonical(undefined), null);
});

test('analyzeDestination: none directive, robots agent meta, relative canonical resolved', () => {
  const a = analyzeDestination({ url: 'https://e.com/dir/page', headers: { 'x-robots-tag': null, link: null }, body: '<head><meta name="bingbot" content="noindex"><link rel="canonical" href="../other"></head>' }, { robotsAgent: 'bingbot' });
  assert.deepEqual(a.noindex, { source: 'meta bingbot', value: 'noindex' });
  assert.equal(a.canonical, 'https://e.com/other');
  const b = analyzeDestination({ url: 'https://e.com/', headers: { 'x-robots-tag': 'none', link: null }, body: null });
  assert.equal(b.noindex?.source, 'X-Robots-Tag');
  assert.equal(b.canonical, null);
});

test('wrong-destination hints: protocol and host differences', () => {
  const short = (u) => u;
  const proto = destinationIssue('http://e.com/a', 'https://e.com/a', {}, short);
  assert.equal(proto?.details.differsBy, 'protocol');
  assert.match(proto?.message ?? '', /\(http instead of https\)/);
  const host = destinationIssue('https://e.com/a', 'https://www.e.com/a', {}, short);
  assert.equal(host?.details.differsBy, 'host');
  assert.equal(destinationIssue('https://e.com/a?x=1', 'https://e.com/a', { ignoreQuery: true }, short), null);
  assert.equal(destinationIssue('https://e.com/a?x=1', 'https://e.com/a', {}, short)?.details.differsBy, 'query');
});

test('heuristics without base use the majority protocol and host', () => {
  const mk = (id, from, final) => ({
    entry: { id, source: `m:${id}`, from, expected: { to: null, status: null, mode: 'any' } },
    trace: { chain: [{}, {}], final: { url: final }, error: null, loop: false, tooMany: false },
    eff: { collapseThreshold: 10 },
    issues: [],
  });
  const results = [mk(1, 'https://e.com/a', 'https://e.com/x'), mk(2, 'https://e.com/b', 'https://e.com/y'), mk(3, 'https://e.com/c', 'http://www.e.com/z')];
  applyHeuristics(results, { base: null, collapseThreshold: 10 });
  assert.deepEqual(results[2].issues.map((i) => i.rule).sort(), ['host-inconsistent', 'protocol-inconsistent']);
  assert.deepEqual(results[0].issues, []);
});
