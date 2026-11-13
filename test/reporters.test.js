import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startServer, redirect, page } from './helpers/fixture-server.js';
import { check } from '../src/check.js';
import { formatReport } from '../src/report/format.js';
import { escapeCell, MARKDOWN_MARKER } from '../src/report/markdown.js';
import { formatGithub, escapeData, escapeProperty } from '../src/report/github.js';
import { capabilities, colorSupport, unicodeSupport } from '../src/report/ansi.js';

const PROD = 'https://www.example.com';
/** @type {Awaited<ReturnType<typeof startServer>>} */
let srv;
/** @type {any} */
let report;
/** @type {any} */
let clean;

before(async () => {
  srv = await startServer({
    '/chi-siamo': redirect('/about/'),
    '/about/': redirect('/about', 302),
    '/about': page(),
    '/servizi/seo': redirect('/services/seo'),
    '/services/seo': page('<meta name="robots" content="noindex,follow">'),
    '/ok-old': redirect('/team'),
    '/team': page(),
    '/two': redirect('/two-b'),
    '/two-b': redirect('/team'),
    '/old|pipe': redirect('/team'),
  });
  const base = {
    base: PROD,
    hostRewrite: { [PROD]: srv.origin },
    retries: 0,
    headers: { Authorization: 'Basic c2VjcmV0OnNlY3JldA==' },
  };
  report = await check({
    ...base,
    entries: [
      { from: '/chi-siamo', to: '/team', source: 'redirects.csv:13' },
      { from: '/servizi/seo', to: '/services/seo', source: 'redirects.csv:41' },
      { from: '/ok-old', to: '/team', source: 'redirects.csv:50' },
      { from: '/two', to: '/team', source: 'redirects.csv:60' },
    ],
  });
  clean = await check({ ...base, entries: [{ from: '/ok-old', to: '/team', source: 'm.csv:2' }] });
});
after(() => srv.close());

/** Tiny JSON-schema subset validator: type, const, enum, required, properties, items, additionalProperties. */
function validate(schema, value, path = '$', root = schema) {
  if (schema.$ref) return validate(root.$defs[schema.$ref.split('/').pop()], value, path, root);
  const errors = [];
  const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
  if (schema.type) {
    const types = [].concat(schema.type);
    const t = typeOf(value);
    if (!types.includes(t) && !(t === 'integer' && types.includes('number'))) return [`${path}: expected ${types.join('|')}, got ${t}`];
  }
  if ('const' in schema && value !== schema.const) errors.push(`${path}: expected ${schema.const}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${value} not in enum`);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of schema.required ?? []) if (!(k in value)) errors.push(`${path}: missing ${k}`);
    for (const [k, sub] of Object.entries(schema.properties ?? {})) if (k in value) errors.push(...validate(sub, value[k], `${path}.${k}`, root));
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      for (const [k, v] of Object.entries(value)) if (!(k in (schema.properties ?? {}))) errors.push(...validate(schema.additionalProperties, v, `${path}.${k}`, root));
    }
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => errors.push(...validate(schema.items, v, `${path}[${i}]`, root)));
  return errors;
}

test('JSON report matches schema/report.schema.json and masks header values', async () => {
  const schema = JSON.parse(await readFile(new URL('../schema/report.schema.json', import.meta.url), 'utf8'));
  const json = JSON.parse(formatReport(report, 'json'));
  assert.deepEqual(validate(schema, json), []);
  assert.deepEqual(json.options.headers, { Authorization: '***' });
  assert.ok(!formatReport(report, 'json').includes('c2VjcmV0'), 'header value never appears');
  assert.equal(json.results[0].source, 'redirects.csv:13');
  assert.deepEqual(validate(schema, JSON.parse(formatReport(clean, 'json'))), []);
});

test('text reporter without color: blocks, chain, expected line, hints, summary and verdict', () => {
  const text = formatReport(report, 'text', { color: false, unicode: true, columns: 100 });
  assert.ok(!text.includes('\x1b['), 'no ANSI codes when color is off');
  const lines = text.split('\n');
  assert.match(lines[0], /^redirect-guard \d+\.\d+\.\d+ · 4 URLs · base https:\/\/www\.example\.com$/);
  assert.match(lines[1], /testing against http:\/\/127\.0\.0\.1:\d+ \(host rewrite\)/);
  assert.match(text, / FAIL {2}\/chi-siamo +redirects\.csv:13\n {9}301 {2}\/chi-siamo\n {7}→ 302 {2}\/about\/\n {7}→ 200 {2}\/about\n {9}expected \/team\n/);
  assert.match(text, / {9}✖ wrong-destination +Ends at \/about, expected \/team\n {11}Point the redirect for \/chi-siamo directly at \/team\./);
  assert.match(text, /✖ status-not-permanent +Hop 2 returned 302, expected 301 or 308/);
  assert.match(text, /▲ chain-too-long +2 hops, limit is 1/);
  assert.match(text, /✖ target-noindex +<meta name="robots" content="noindex,follow">/);
  assert.match(text, / WARN {2}\/two +redirects\.csv:60\n {9}301 {2}\/two {2}→ 301 \/two-b {2}→ 200 \/team\n/);
  assert.ok(!text.includes('/ok-old'), 'passing entries are only counted');
  assert.match(text, / 4 checked · 1 ok · 1 warn · 2 fail · \d+\.\ds/);
  assert.match(text, / Top issues\n/);
  assert.match(text, / ✖ 2 entries failed\. Exit code 1\.\n Rule docs: /);
  // fail entries come before warn entries
  assert.ok(text.indexOf('/servizi/seo') < text.indexOf(' WARN '));
});

test('text reporter: ASCII fallback, verbose, quiet, strict verdict and clean run', () => {
  const ascii = formatReport(report, 'text', { unicode: false });
  assert.match(ascii, /x wrong-destination/);
  assert.match(ascii, / {6}-> 302/);
  assert.ok(!/[✖▲✔→·─]/.test(ascii));
  const verbose = formatReport(report, 'text', { verbose: true });
  assert.match(verbose, /  OK   \/ok-old/);
  assert.match(verbose, /via http:\/\/127\.0\.0\.1:\d+\/ok-old/);
  assert.match(verbose, /robots agent googlebot · concurrency 4/);
  const quiet = formatReport(report, 'text', { quiet: true });
  assert.ok(!quiet.includes('redirect-guard 0.'), 'no header in quiet mode');
  assert.ok(!quiet.includes(' WARN '), 'no warn blocks in quiet mode');
  assert.match(quiet, / FAIL {2}\/chi-siamo +✖ wrong-destination ✖ status-not-permanent ▲ chain-too-long/);
  const strictOnlyWarn = { ...report, summary: { ...report.summary, fail: 0 }, results: report.results.filter((r) => r.status !== 'fail') };
  assert.match(formatReport(strictOnlyWarn, 'text', { failOn: 'warn' }), /with warnings \(--strict\)\. Exit code 1\./);
  assert.match(formatReport(strictOnlyWarn, 'text', {}), /No failures\. 1 warning \(use --strict to fail on warnings\)\. Exit code 0\./);
  const c = formatReport(clean, 'text', {});
  assert.match(c, /^redirect-guard .*\n.*host rewrite.*\n\n ✔ All 1 entry pass\. 0 warnings\. \d+\.\ds\. Exit code 0\.\n$/);
});

test('text reporter colors when enabled', () => {
  const text = formatReport(report, 'text', { color: true });
  assert.ok(text.includes('\x1b[1;97;41m FAIL \x1b[0m'));
  assert.ok(text.includes('\x1b[36m301\x1b[0m'));
  assert.ok(text.includes('\x1b[33m302\x1b[0m'));
});

test('markdown reporter: marker, summary table, failures, warnings in details', () => {
  const md = formatReport(report, 'markdown');
  assert.ok(md.startsWith(`${MARKDOWN_MARKER}\n### redirect-guard: 2 failing, 1 warning\n`));
  assert.match(md, /\| 4 \| 1 \| 1 \| 2 \| \d+\.\ds \|/);
  assert.match(md, /\| `\/chi-siamo` \| 301 → 302 `\/about\/` → 200 `\/about` \| \*\*wrong-destination\*\* Ends at \/about, expected \/team/);
  assert.match(md, /<details><summary>1 warning<\/summary>/);
  assert.match(md, /\[rule docs\]\(https:\/\/github\.com\/OWNER\/redirect-guard\/blob\/main\/docs\/rules\.md\)/);
  assert.equal(escapeCell('a|b `c`\nd <e>'), "a\\|b 'c' d &lt;e>");
});

test('github reporter: annotations on the map line, escaping and caps', () => {
  const out = formatGithub(report);
  assert.match(out, /^::error file=redirects\.csv,line=13,title=wrong-destination::\/chi-siamo Ends at \/about, expected \/team$/m);
  assert.match(out, /^::warning file=redirects\.csv,line=60,title=chain-too-long::\/two 2 hops, limit is 1$/m);
  assert.equal(escapeData('50% a\nb'), '50%25 a%0Ab');
  assert.equal(escapeProperty('a:b,c'), 'a%3Ab%2Cc');
  const many = { results: Array.from({ length: 60 }, (_, i) => ({ from: `https://e.com/${i}`, source: `m.csv:${i + 2}`, issues: [{ rule: 'no-redirect', severity: 'error', message: 'x' }] })) };
  const capped = formatGithub(many).trim().split('\n');
  assert.equal(capped.length, 51);
  assert.match(capped[50], /^::notice title=redirect-guard::10 more errors/);
});

test('color and unicode detection', () => {
  const tty = { isTTY: true };
  assert.equal(colorSupport(tty, {}), true);
  assert.equal(colorSupport({ isTTY: false }, {}), false);
  assert.equal(colorSupport(tty, { NO_COLOR: '1' }), false);
  assert.equal(colorSupport(tty, { NO_COLOR: '' }), true, 'empty NO_COLOR is ignored');
  assert.equal(colorSupport(tty, { TERM: 'dumb' }), false);
  assert.equal(colorSupport({ isTTY: false }, { FORCE_COLOR: '1' }), true);
  assert.equal(colorSupport(tty, { FORCE_COLOR: '0' }), false);
  assert.equal(colorSupport({ isTTY: false }, { FORCE_COLOR: '', NO_COLOR: '1' }), true, 'FORCE_COLOR beats NO_COLOR');
  assert.equal(colorSupport(tty, {}, { noColor: true }), false);
  assert.equal(unicodeSupport({}, 'linux'), true);
  assert.equal(unicodeSupport({ TERM: 'linux' }, 'linux'), false);
  assert.equal(unicodeSupport({}, 'win32'), false);
  assert.equal(unicodeSupport({ WT_SESSION: '1' }, 'win32'), true);
  assert.deepEqual(capabilities(tty, {}, { platform: 'darwin' }), { color: true, unicode: true });
});
