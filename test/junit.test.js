import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatJunit, xmlEscape } from '../src/report/junit.js';

const report = {
  startedAt: '2026-11-13T10:00:00.000Z',
  durationMs: 1234,
  options: { failOn: 'error' },
  results: [
    {
      from: 'https://www.example.com/a?x=1&y=<2>',
      source: 'm.csv:2',
      status: 'fail',
      chain: [
        { url: 'https://www.example.com/a?x=1&y=<2>', status: 301, durationMs: 10 },
        { url: 'https://www.example.com/b', status: 200, durationMs: 20 },
      ],
      issues: [{ rule: 'wrong-destination', severity: 'error', message: 'Ends at /b, expected "/c"\u0001' }],
    },
    {
      from: 'https://www.example.com/w',
      source: 'm.csv:3',
      status: 'warn',
      chain: [{ url: 'https://www.example.com/w', status: 200, durationMs: 5 }],
      issues: [{ rule: 'chain-too-long', severity: 'warn', message: '2 hops' }],
    },
    {
      from: 'https://www.example.com/ok',
      source: 'm.csv:4',
      status: 'ok',
      chain: [{ url: 'https://www.example.com/ok', status: 200, durationMs: 5 }],
      issues: [],
    },
    {
      from: 'https://www.example.com/err',
      source: 'm.csv:5',
      status: 'fail',
      chain: [{ url: 'https://www.example.com/err', status: null, durationMs: null, error: { code: 'ETIMEDOUT', message: 'No response' } }],
      issues: [{ rule: 'request-failed', severity: 'error', message: 'ETIMEDOUT' }],
    },
  ],
};

test('xmlEscape escapes markup and strips invalid XML 1.0 characters', () => {
  assert.equal(xmlEscape('<a href="x">&\'\u0000\u0008\u000b￾'), '&lt;a href=&quot;x&quot;&gt;&amp;&apos;');
  assert.equal(xmlEscape('tab\tnewline\n'), 'tab\tnewline\n');
});

test('JUnit structure: suites, testcases, failures and system-out', () => {
  const xml = formatJunit(report);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="redirect-guard" tests="4" failures="2" time="1.234">'));
  assert.match(xml, /<testsuite name="redirect-guard" tests="4" failures="2" errors="0" skipped="0" time="1\.234"/);
  assert.match(xml, /<testcase classname="https:\/\/www\.example\.com" name="\/a\?x=1&amp;y=%3C2%3E" time="0\.030">/);
  assert.match(xml, /<failure type="wrong-destination" message="wrong-destination: Ends at \/b, expected &quot;\/c&quot;">/);
  assert.ok(!xml.includes('\u0001'));
  assert.match(xml, /<system-out>\[warn\] chain-too-long: 2 hops<\/system-out>/);
  assert.match(xml, /<testcase classname="https:\/\/www\.example\.com" name="\/ok" time="0\.005" \/>/);
  assert.match(xml, /ERR https:\/\/www\.example\.com\/err ETIMEDOUT: No response/);
  // balanced tags
  assert.equal((xml.match(/<testcase /g) || []).length, 4);
  assert.equal((xml.match(/<\/testcase>/g) || []).length + (xml.match(/<testcase [^>]*\/>/g) || []).length, 4);
});

test('with failOn warn, warnings become failures', () => {
  const xml = formatJunit(report, { failOn: 'warn' });
  assert.match(xml, /failures="3"/);
  assert.match(xml, /<failure type="chain-too-long"/);
  assert.ok(!xml.includes('<system-out>'));
});
