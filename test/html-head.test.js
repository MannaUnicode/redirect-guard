import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractHeadSignals } from '../src/parse/html-head.js';

const fx = async (name) => readFile(new URL(`./fixtures/html/${name}`, import.meta.url), 'utf8');

test('meta robots with uppercase attributes, any order and quotes; body ignored', async () => {
  const s = extractHeadSignals(await fx('noindex-meta.html'));
  assert.deepEqual(s.robots, ['noindex, follow']);
  assert.equal(s.canonical, null);
});

test('unquoted googlebot meta and multi-token rel', async () => {
  const s = extractHeadSignals(await fx('googlebot-meta.html'));
  assert.deepEqual(s.robots, ['none']);
  assert.deepEqual(s.meta, [{ name: 'googlebot', content: 'none' }]);
  assert.equal(s.canonical, 'https://www.example.com/a');
});

test('comments and scripts are skipped, first canonical wins, entities decoded', async () => {
  const s = extractHeadSignals(await fx('canonical-multiple.html'));
  assert.equal(s.canonical, '/first?a=1&b=2');
  assert.deepEqual(s.canonicals, ['/first?a=1&b=2', '/second']);
});

test('documents without a head are scanned until <body> or the end', async () => {
  const s = extractHeadSignals(await fx('no-head.html'));
  assert.deepEqual(s.robots, ['noindex']);
  assert.deepEqual(extractHeadSignals('<html><body><meta name="robots" content="noindex"></body>').robots, []);
});

test('empty and missing input', () => {
  assert.deepEqual(extractHeadSignals('').robots, []);
  assert.equal(extractHeadSignals(undefined).canonical, null);
});

test('link without href or empty href is ignored', () => {
  assert.equal(extractHeadSignals('<head><link rel="canonical"><link rel=canonical href=""></head>').canonical, null);
});
