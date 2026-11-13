import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve as resolvePath } from 'node:path';
import { parseCli, parseReporterSpec, assertSingleStdout } from './args.js';
import { mainHelp, diffHelp } from './help.js';
import { loadConfigFile } from '../config/load.js';
import { mergeOptions } from '../config/merge.js';
import { check } from '../check.js';
import { diffSitemaps } from '../diff/sitemap-diff.js';
import { loadMap, detectFormat } from '../input/load-map.js';
import { exitCodeFor } from '../engine.js';
import { formatReport } from '../report/format.js';
import { capabilities } from '../report/ansi.js';
import { UsageError, ConfigError, InputError } from '../errors.js';
import { version } from '../version.js';

/**
 * @typedef {{ write: (s: string) => any, isTTY?: boolean, columns?: number }} Out
 * @typedef {{ stdout: Out, stderr: Out, stdin?: AsyncIterable<any>, env?: Record<string, string | undefined>, cwd?: string, fetch?: typeof fetch }} IO
 */

/** @param {AsyncIterable<any>} stream */
async function readAll(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Print an error in the CLI format and return exit code 2.
 * @param {any} err
 * @param {Out} stderr
 * @param {Record<string, string | undefined>} env
 */
function printError(err, stderr, env) {
  const known = err instanceof UsageError || err instanceof ConfigError || err instanceof InputError;
  const lines = [`redirect-guard: ${known ? err.message : `internal error: ${err?.message ?? err}`}`];
  if (err?.frame) lines.push(...String(err.frame).split('\n').map((l) => `  ${l}`));
  if (err?.hint) lines.push(`  ${err.hint}`);
  if (err instanceof UsageError) lines.push('  Run "redirect-guard --help" for usage.');
  if (!known && /\bredirect-guard\b/.test(env.DEBUG ?? '') && err?.stack) lines.push(err.stack);
  else if (!known) lines.push('  Set DEBUG=redirect-guard to print the stack trace.');
  stderr.write(`${lines.join('\n')}\n`);
  return 2;
}

/**
 * CLI entry point. Pure apart from the given streams and the files reporters write.
 * @param {string[]} argv
 * @param {IO} io
 * @returns {Promise<number>} exit code
 */
export async function run(argv, io) {
  const { stdout, stderr } = io;
  const env = io.env ?? {};
  const cwd = io.cwd ?? process.cwd();
  /** @type {null | (() => void)} */
  let clearProgress = null;
  try {
    const cli = parseCli(argv, env);
    if (cli.help) {
      stdout.write(cli.command === 'diff' ? diffHelp() : mainHelp());
      return 0;
    }
    if (cli.version) {
      stdout.write(`${version}\n`);
      return 0;
    }
    if (cli.noConfig && cli.configPath) throw new UsageError('--config and --no-config cannot be used together');
    const file = cli.noConfig ? null : await loadConfigFile({ cwd, path: cli.configPath, env });
    const fileCfg = { ...(file?.config ?? {}) };
    delete fileCfg.$schema;
    if (cli.map || cli.options.sitemap) {
      delete fileCfg.map;
      delete fileCfg.sitemap;
    }
    if (cli.map && cli.options.sitemap) throw new UsageError('give either a map file or --sitemap, not both');
    const merged = mergeOptions(fileCfg, cli.options);

    const reporters = cli.reporters ?? (merged.reporters ?? ['text']).map(parseReporterSpec);
    assertSingleStdout(reporters);
    delete merged.reporters;

    /** @type {any[] | undefined} */
    let entries;
    if (cli.command === 'check') {
      if (cli.map === '-') {
        if (!io.stdin) throw new UsageError('stdin is not available');
        const text = await readAll(io.stdin);
        entries = await loadMap({ text, format: detectFormat(undefined, text) }, { base: merged.base, cwd });
        delete merged.map;
      } else if (cli.map) {
        merged.map = resolvePath(cwd, cli.map);
      }
      if (!entries && !merged.map && !merged.sitemap) {
        throw new UsageError('nothing to check: give a map file or --sitemap <url|file>');
      }
    } else if (cli.map) {
      throw new UsageError(`unexpected argument "${cli.map}" for diff`, { hint: 'Use --old <src> --new <src>.' });
    }

    // progress on stderr (TTY only)
    /** @type {((done: number, total: number, stats: { fail: number, active: number }) => void) | undefined} */
    let onProgress;
    if (stderr.isTTY && !cli.quiet) {
      const t0 = Date.now();
      let last = 0;
      let shown = false;
      onProgress = (done, total, stats) => {
        const now = Date.now();
        if (now - last < 100 && done !== total) return;
        last = now;
        shown = true;
        stderr.write(`\r\x1b[2K checking ${done}/${total} · ${stats.active} in flight · ${stats.fail} fail · ${((now - t0) / 1000).toFixed(1)}s`);
      };
      clearProgress = () => {
        if (shown) stderr.write('\r\x1b[2K');
        shown = false;
      };
    }

    const common = { ...merged, cwd, fetch: io.fetch, onProgress };
    const report =
      cli.command === 'diff'
        ? await diffSitemaps({ ...common, old: cli.old ?? undefined, new: cli.new ?? undefined, offline: cli.offline })
        : await check({ ...common, ...(entries ? { entries } : {}) });
    clearProgress?.();

    if (!cli.quiet) for (const w of report.warnings ?? []) stderr.write(`redirect-guard: warning: ${w}\n`);

    const failOn = merged.failOn ?? 'error';
    for (const r of reporters) {
      const toStdout = !r.file;
      const caps = toStdout ? capabilities(stdout, env, { noColor: cli.noColor }) : { color: false, unicode: true };
      const text = formatReport(report, /** @type {any} */ (r.name), {
        color: r.name === 'text' ? caps.color : false,
        unicode: caps.unicode,
        verbose: cli.verbose,
        quiet: cli.quiet,
        columns: toStdout ? stdout.columns : 100,
        failOn,
      });
      if (toStdout) stdout.write(text);
      else {
        const target = resolvePath(cwd, /** @type {string} */ (r.file));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, text, 'utf8');
      }
    }
    return exitCodeFor(report, failOn);
  } catch (err) {
    clearProgress?.();
    return printError(err, stderr, env);
  }
}
