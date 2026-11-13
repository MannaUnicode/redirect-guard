import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);

/** Timings and the random fixture port are the only parts allowed to differ. @param {string} s */
const normalize = (s) => s.replace(/127\.0\.0\.1:\d+/g, '127.0.0.1:PORT').replace(/\d+\.\ds\b/g, 'X.Xs');

test('README sample output matches `npm run demo`', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const m = /<!-- demo:start -->\n```\n([\s\S]*?)```\n<!-- demo:end -->/.exec(readme);
  assert.ok(m, 'README has demo markers');
  const script = fileURLToPath(new URL('../scripts/demo.js', import.meta.url));
  const env = { ...process.env, NO_COLOR: '1', CI: '1' };
  delete env.FORCE_COLOR;
  const { stdout } = await exec(process.execPath, [script], { env });
  assert.equal(normalize(stdout), normalize(m[1]));
});
