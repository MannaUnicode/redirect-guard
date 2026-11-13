#!/usr/bin/env node
import { run } from '../src/cli/main.js';

run(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin,
  env: process.env,
  cwd: process.cwd(),
}).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`redirect-guard: internal error: ${err && err.message ? err.message : err}\n`);
    process.exitCode = 2;
  },
);
