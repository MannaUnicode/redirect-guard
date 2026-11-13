import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfigFile, expandEnv } from '../src/config/load.js';
import { validateConfig, CONFIG_KEYS } from '../src/config/validate.js';
import { mergeOptions } from '../src/config/merge.js';
import { DEFAULTS } from '../src/config/defaults.js';
import { ConfigError } from '../src/errors.js';

const fxDir = fileURLToPath(new URL('./fixtures/config/', import.meta.url));

test('valid JSON config loads', async () => {
  const r = await loadConfigFile({ cwd: fxDir, path: 'valid.json' });
  assert.equal(r?.config.maxHops, 2);
  assert.deepEqual(r?.config.exclude, ['/wp-admin/**']);
});

test('.mjs config loads through import()', async () => {
  const r = await loadConfigFile({ cwd: fxDir, path: 'config.mjs' });
  assert.equal(r?.config.maxHops, 3);
  assert.deepEqual(r?.config.rules, { 'chain-too-long': 'off' });
});

test('discovery in cwd: json first, none found returns null', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rg-config-'));
  try {
    assert.equal(await loadConfigFile({ cwd: dir }), null);
    await writeFile(join(dir, 'redirect-guard.config.json'), '{"maxHops": 4, "map": "redirects.csv"}');
    await writeFile(join(dir, 'redirect-guard.config.mjs'), 'export default { maxHops: 5 }');
    const r = await loadConfigFile({ cwd: dir });
    assert.equal(r?.config.maxHops, 4);
    assert.equal(r?.config.map, join(dir, 'redirects.csv'), 'map is resolved relative to the config file');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('unknown rule id and unknown key give "did you mean" hints', async () => {
  await assert.rejects(loadConfigFile({ cwd: fxDir, path: 'invalid-rule.json' }), (err) => {
    assert.ok(err instanceof ConfigError);
    assert.match(err.message, /rules\.chain-to-long is not a known rule id/);
    assert.equal(err.hint, 'Did you mean "chain-too-long"?');
    return true;
  });
  await assert.rejects(loadConfigFile({ cwd: fxDir, path: 'invalid-key.json' }), (err) => err.hint === 'Did you mean "concurrency"?');
  await assert.rejects(loadConfigFile({ cwd: fxDir, path: 'nope.json' }), /config file not found/);
});

test('validator checks types and ranges', () => {
  assert.throws(() => validateConfig({ concurrency: 0 }), /concurrency must be an integer between 1 and 32/);
  assert.throws(() => validateConfig({ base: 'ftp://x' }), /base must be an http\(s\) URL/);
  assert.throws(() => validateConfig({ expectStatus: [200] }), /3xx status codes/);
  assert.throws(() => validateConfig({ failOn: 'never' }), /failOn/);
  assert.throws(() => validateConfig({ headers: { 'bad header': 'x' } }), /not a valid header name/);
  assert.throws(() => validateConfig({ overrides: [{ match: '/a/**', maxHop: 2 }] }), (err) => /not allowed in overrides/.test(err.message) && err.hint === 'Did you mean "maxHops"?');
  assert.throws(() => validateConfig({ reporters: ['jnuit'] }), (err) => err.hint === 'Did you mean "junit"?');
  assert.doesNotThrow(() => validateConfig({ ...DEFAULTS }));
});

test('$env: expansion in headers, base and hostRewrite; missing variable names it without a value', () => {
  const out = expandEnv({ headers: { Authorization: 'Basic $env:TOKEN' }, base: '$env:BASE', hostRewrite: { 'https://a.example': '$env:STAGING' } }, { TOKEN: 'abc', BASE: 'https://b.example', STAGING: 'https://s.example' });
  assert.equal(out.headers.Authorization, 'Basic abc');
  assert.equal(out.base, 'https://b.example');
  assert.equal(out.hostRewrite['https://a.example'], 'https://s.example');
  assert.throws(
    () => expandEnv({ headers: { X: '$env:MISSING_VAR' } }, {}),
    (err) => err.message === 'environment variable MISSING_VAR is not set' && err.hint === 'Referenced by headers.X.',
  );
});

test('merge: defaults < file < cli; include/exclude appended, objects merged, reporters replaced', () => {
  const m = mergeOptions(
    DEFAULTS,
    { exclude: ['/a/**'], headers: { A: '1' }, reporters: ['json'], maxHops: 2 },
    { exclude: ['/b/**'], headers: { B: '2' }, reporters: ['text'], maxHops: undefined },
  );
  assert.deepEqual(m.exclude, ['/a/**', '/b/**']);
  assert.deepEqual(m.headers, { A: '1', B: '2' });
  assert.deepEqual(m.reporters, ['text']);
  assert.equal(m.maxHops, 2);
  assert.equal(m.concurrency, 4);
});

test('config.schema.json and the validator describe the same keys', async () => {
  const schema = JSON.parse(await readFile(new URL('../schema/config.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(schema.properties).sort(), [...CONFIG_KEYS].sort());
  for (const key of Object.keys(DEFAULTS)) assert.ok(CONFIG_KEYS.includes(key), key);
});
