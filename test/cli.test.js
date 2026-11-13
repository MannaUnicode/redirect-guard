import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { startServer, redirect, page } from './helpers/fixture-server.js';
import { runCli } from './helpers/run-cli.js';
import { parseCli, parseReporterSpec } from '../src/cli/args.js';

const exec = promisify(execFile);
/** @type {Awaited<ReturnType<typeof startServer>>} */
let srv;
/** @type {string} */
let dir;

before(async () => {
  srv = await startServer({
    '/a': redirect('/b'),
    '/b': page(),
    '/two': redirect('/two-b'),
    '/two-b': redirect('/b'),
    '/temp': redirect('/b', 302),
    '/auth': (req, res) => {
      res.writeHead(req.headers.authorization === `Basic ${Buffer.from('user:pass').toString('base64')}` ? 200 : 401, { 'content-type': 'text/html' });
      res.end('<html></html>');
    },
  });
  dir = await mkdtemp(join(tmpdir(), 'rg-cli-'));
  await writeFile(join(dir, 'ok.csv'), 'from,to\n/a,/b\n');
  await writeFile(join(dir, 'warn.csv'), 'from,to\n/two,/b\n');
  await writeFile(join(dir, 'fail.csv'), 'from,to\n/temp,/b\n/a,/b\n');
  await writeFile(join(dir, 'bad.csv'), 'from,to\n/a,"/b\n');
  await writeFile(join(dir, 'dupes.csv'), 'from,to\n/a,/x\n/a,/b\n');
});
after(async () => {
  await srv.close();
  await rm(dir, { recursive: true, force: true });
});

const base = () => ['--base', srv.origin, '--retries', '0', '--no-config'];

test('exit 0 on a clean run, report on stdout', async () => {
  const r = await runCli(['ok.csv', ...base()], { cwd: dir });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /All 1 entry pass\. 0 warnings\. .*Exit code 0\./);
  assert.equal(r.stderr, '');
});

test('"check" command is the default and explicit', async () => {
  const r = await runCli(['check', 'ok.csv', ...base()], { cwd: dir });
  assert.equal(r.code, 0);
});

test('exit 1 on failures; warnings pass unless --strict or --fail-on warn', async () => {
  assert.equal((await runCli(['fail.csv', ...base()], { cwd: dir })).code, 1);
  assert.equal((await runCli(['warn.csv', ...base()], { cwd: dir })).code, 0);
  assert.equal((await runCli(['warn.csv', ...base(), '--strict'], { cwd: dir })).code, 1);
  assert.equal((await runCli(['warn.csv', ...base(), '--fail-on', 'warn'], { cwd: dir })).code, 1);
});

test('exit 2 on usage errors with suggestions', async () => {
  const r = await runCli(['ok.csv', '--concurency', '8'], { cwd: dir });
  assert.equal(r.code, 2);
  assert.equal(r.stderr, 'redirect-guard: unknown option --concurency\n  Did you mean --concurrency?\n  Run "redirect-guard --help" for usage.\n');
  assert.equal((await runCli(['ok.csv', ...base(), '--quiet', '--verbose'], { cwd: dir })).code, 2);
  assert.equal((await runCli(['ok.csv', ...base(), '--strict', '--fail-on', 'error'], { cwd: dir })).code, 2);
  assert.equal((await runCli(['ok.csv', ...base(), '--concurrency', '99'], { cwd: dir })).code, 2);
  assert.equal((await runCli(['--no-config'], { cwd: dir })).code, 2);
  const rep = await runCli(['ok.csv', ...base(), '--reporter', 'jnuit'], { cwd: dir });
  assert.equal(rep.code, 2);
  assert.match(rep.stderr, /Did you mean "junit"\?/);
  const two = await runCli(['ok.csv', ...base(), '--json', '--markdown'], { cwd: dir });
  assert.equal(two.code, 2);
  assert.match(two.stderr, /only one reporter can write to stdout; give the others a file, e\.g\. --reporter junit:rg\.xml/);
});

test('exit 2 on input errors, with a code frame', async () => {
  const r = await runCli(['bad.csv', ...base()], { cwd: dir });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /^redirect-guard: cannot parse bad\.csv\n {2}bad\.csv:2:4 {2}unterminated quoted field\n {5}2 \| \/a,"\/b\n/);
  assert.equal((await runCli(['missing.csv', ...base()], { cwd: dir })).code, 2);
});

test('exit 2 when filters leave nothing to check', async () => {
  const r = await runCli(['ok.csv', ...base(), '--exclude', '/**'], { cwd: dir });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /no entries to check \(1 loaded, 1 excluded by --exclude "\/\*\*"\)/);
});

test('missing env var for --auth-env is exit 2 and the value is never printed', async () => {
  const r = await runCli(['ok.csv', ...base(), '--auth-env', 'STAGING_AUTH'], { cwd: dir });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /environment variable STAGING_AUTH is not set\n {2}Referenced by --auth-env STAGING_AUTH\./);
});

test('--auth-env sends Basic auth to the site under test', async () => {
  await writeFile(join(dir, 'auth.csv'), '/auth,,200\n');
  const r = await runCli(['auth.csv', ...base(), '--auth-env', 'STAGING_AUTH'], { cwd: dir, env: { STAGING_AUTH: 'user:pass' } });
  assert.equal(r.code, 0, r.stdout);
  const bad = await runCli(['auth.csv', ...base()], { cwd: dir });
  assert.equal(bad.code, 1);
});

test('--json writes a clean JSON document to stdout', async () => {
  const r = await runCli(['fail.csv', ...base(), '--json'], { cwd: dir });
  assert.equal(r.code, 1);
  const json = JSON.parse(r.stdout);
  assert.equal(json.schemaVersion, 1);
  assert.equal(json.results[0].source, 'fail.csv:2');
  assert.equal(json.input.label, 'fail.csv');
});

test('reporters to files; text to stdout only when asked', async () => {
  const r = await runCli(['fail.csv', ...base(), '--reporter', 'junit:out/rg.xml', '--reporter', 'markdown:out/rg.md', '--reporter', 'text'], { cwd: dir });
  assert.equal(r.code, 1);
  assert.match(r.stdout, / FAIL /);
  assert.match(await readFile(join(dir, 'out/rg.xml'), 'utf8'), /<testsuites name="redirect-guard"/);
  assert.match(await readFile(join(dir, 'out/rg.md'), 'utf8'), /^<!-- redirect-guard-report -->/);
  const onlyFile = await runCli(['fail.csv', ...base(), '--reporter', 'json:out/rg.json'], { cwd: dir });
  assert.equal(onlyFile.stdout, '', 'any --reporter replaces the default text reporter');
});

test('github reporter prints workflow commands', async () => {
  const r = await runCli(['fail.csv', ...base(), '--reporter', 'github'], { cwd: dir });
  assert.match(r.stdout, /^::error file=fail\.csv,line=2,title=status-not-permanent::\/temp Hop 1 returned 302/m);
});

test('NO_COLOR and --no-color disable colors even on a TTY; FORCE_COLOR enables them', async () => {
  const tty = await runCli(['fail.csv', ...base()], { cwd: dir, isTTY: true, env: { NO_COLOR: '' } });
  assert.ok(tty.stdout.includes('\x1b['));
  const nc = await runCli(['fail.csv', ...base()], { cwd: dir, isTTY: true, env: { NO_COLOR: '1' } });
  assert.ok(!nc.stdout.includes('\x1b['));
  const flag = await runCli(['fail.csv', ...base(), '--no-color'], { cwd: dir, isTTY: true, env: { NO_COLOR: '' } });
  assert.ok(!flag.stdout.includes('\x1b['));
  const forced = await runCli(['fail.csv', ...base()], { cwd: dir, isTTY: false, env: { NO_COLOR: '', FORCE_COLOR: '1' } });
  assert.ok(forced.stdout.includes('\x1b['));
});

test('stdin map with "-"', async () => {
  const r = await runCli(['-', ...base()], { cwd: dir, stdin: '/a,/b\n' });
  assert.equal(r.code, 0, r.stderr);
});

test('duplicate rows print a warning on stderr; the last row wins', async () => {
  const r = await runCli(['dupes.csv', ...base()], { cwd: dir });
  assert.equal(r.code, 0);
  assert.match(r.stderr, /warning: duplicate "from" \/a at dupes\.csv:2 and dupes\.csv:3; the last row wins/);
});

test('config file is discovered in cwd and CLI flags override it', async () => {
  const cdir = await mkdtemp(join(tmpdir(), 'rg-cfg-'));
  try {
    await writeFile(join(cdir, 'warn.csv'), 'from,to\n/two,/b\n');
    await writeFile(join(cdir, 'redirect-guard.config.json'), JSON.stringify({ base: srv.origin, map: 'warn.csv', retries: 0, failOn: 'warn' }));
    assert.equal((await runCli([], { cwd: cdir })).code, 1, 'config failOn warn applies');
    assert.equal((await runCli(['--fail-on', 'error'], { cwd: cdir })).code, 0, 'CLI flag wins');
    assert.equal((await runCli(['--no-config', 'warn.csv', '--base', srv.origin], { cwd: cdir })).code, 0);
    await writeFile(join(cdir, 'redirect-guard.config.json'), JSON.stringify({ rules: { 'chain-to-long': 'off' } }));
    const bad = await runCli(['warn.csv', '--base', srv.origin], { cwd: cdir });
    assert.equal(bad.code, 2);
    assert.match(bad.stderr, /Did you mean "chain-too-long"\?/);
  } finally {
    await rm(cdir, { recursive: true, force: true });
  }
});

test('host rewrite from the CLI keeps production URLs in reports', async () => {
  await writeFile(join(dir, 'prod.csv'), 'https://www.example.com/a,https://www.example.com/b\n');
  const r = await runCli(['prod.csv', '--no-config', '--retries', '0', '--host-rewrite', `https://www.example.com=${srv.origin}`, '--json'], { cwd: dir });
  assert.equal(r.code, 0, r.stderr);
  const json = JSON.parse(r.stdout);
  assert.equal(json.results[0].final.url, 'https://www.example.com/b');
  assert.equal(json.results[0].chain[0].requestedUrl, `${srv.origin}/a`);
});

test('diff command with --offline', async () => {
  await writeFile(join(dir, 'old.xml'), '<urlset><url><loc>https://x.example/a</loc></url><url><loc>https://x.example/gone</loc></url></urlset>');
  await writeFile(join(dir, 'new.xml'), '<urlset><url><loc>https://x.example/a</loc></url><url><loc>https://x.example/new</loc></url></urlset>');
  const r = await runCli(['diff', '--old', 'old.xml', '--new', 'new.xml', '--offline', '--no-config'], { cwd: dir });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /diff: 1 kept · 1 removed · 1 added/);
  assert.match(r.stdout, /Removed from the sitemap \(1\)\n {3}· https:\/\/x\.example\/gone/);
  assert.equal((await runCli(['diff', '--old', 'old.xml', '--no-config'], { cwd: dir })).code, 2);
  assert.equal((await runCli(['ok.csv', '--old', 'old.xml', '--no-config'], { cwd: dir })).code, 2);
});

test('--help and --version', async () => {
  const h = await runCli(['--help']);
  assert.equal(h.code, 0);
  assert.match(h.stdout, /^redirect-guard \d+\.\d+\.\d+\nCheck a redirect map/);
  assert.match((await runCli(['diff', '--help'])).stdout, /Compare an old and a new sitemap/);
  const v = await runCli(['-v']);
  assert.match(v.stdout, /^\d+\.\d+\.\d+\n$/);
});

test('parseReporterSpec splits on the first colon only (Windows paths)', () => {
  assert.deepEqual(parseReporterSpec('junit:C:\\reports\\rg.xml'), { name: 'junit', file: 'C:\\reports\\rg.xml' });
  assert.deepEqual(parseReporterSpec('text'), { name: 'text', file: null });
});

test('parseCli builds config-shaped options', () => {
  const p = parseCli(['map.csv', '--expect-status', '301,308', '--header', 'X-Token: $env:TOK', '--host-rewrite', 'https://a.example=https://b.example', '--no-indexability', '--exclude', '/a/**', '--exclude', '/b/**'], { TOK: 't' });
  assert.equal(p.map, 'map.csv');
  assert.deepEqual(p.options.expectStatus, [301, 308]);
  assert.deepEqual(p.options.headers, { 'X-Token': 't' });
  assert.deepEqual(p.options.hostRewrite, { 'https://a.example': 'https://b.example' });
  assert.equal(p.options.indexability, false);
  assert.deepEqual(p.options.exclude, ['/a/**', '/b/**']);
  assert.throws(() => parseCli(['--host-rewrite', 'nope']), /expects <from>=<to>/);
  assert.throws(() => parseCli(['--expect-status', '200']), /3xx codes/);
});

test('the bin runs as a real process and sets the exit code', async () => {
  const bin = fileURLToPath(new URL('../bin/redirect-guard.js', import.meta.url));
  const { stdout } = await exec(process.execPath, [bin, '--version']);
  assert.match(stdout, /^\d+\.\d+\.\d+\n$/);
  await assert.rejects(exec(process.execPath, [bin, '--bogus']), (err) => err.code === 2);
  await assert.rejects(exec(process.execPath, [bin, 'fail.csv', ...base()], { cwd: dir, env: { ...process.env, NO_COLOR: '1' } }), (err) => err.code === 1 && /Exit code 1/.test(err.stdout));
});
