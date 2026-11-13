import { Readable } from 'node:stream';
import { run } from '../../src/cli/main.js';

/**
 * Run the CLI in-process with captured streams. No side effects at import time.
 * @param {string[]} argv
 * @param {{ env?: Record<string, string>, cwd?: string, stdin?: string, isTTY?: boolean, fetch?: typeof fetch }} [opts]
 */
export async function runCli(argv, opts = {}) {
  let stdout = '';
  let stderr = '';
  const code = await run(argv, {
    stdout: { write: (s) => (stdout += s), isTTY: opts.isTTY ?? false, columns: 100 },
    stderr: { write: (s) => (stderr += s), isTTY: false },
    stdin: opts.stdin !== undefined ? Readable.from([opts.stdin]) : undefined,
    // CI=1 makes Unicode detection identical on every platform (see report/ansi.js)
    env: { NO_COLOR: '1', CI: '1', ...(opts.env ?? {}) },
    cwd: opts.cwd ?? process.cwd(),
    fetch: opts.fetch,
  });
  return { code, stdout, stderr };
}
