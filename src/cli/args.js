import { parseArgs } from 'node:util';
import { UsageError } from '../errors.js';
import { closest } from '../util/suggest.js';
import { expandEnvString } from '../config/load.js';
import { REPORTERS } from '../report/format.js';

export const OPTIONS = /** @type {const} */ ({
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  base: { type: 'string' },
  sitemap: { type: 'string' },
  'host-rewrite': { type: 'string', multiple: true },
  'expect-status': { type: 'string' },
  'max-hops': { type: 'string' },
  'max-redirects': { type: 'string' },
  concurrency: { type: 'string' },
  delay: { type: 'string' },
  timeout: { type: 'string' },
  retries: { type: 'string' },
  'user-agent': { type: 'string' },
  header: { type: 'string', multiple: true },
  'auth-env': { type: 'string' },
  'robots-agent': { type: 'string' },
  'no-indexability': { type: 'boolean' },
  'no-robots': { type: 'boolean' },
  include: { type: 'string', multiple: true },
  exclude: { type: 'string', multiple: true },
  limit: { type: 'string' },
  config: { type: 'string' },
  'no-config': { type: 'boolean' },
  reporter: { type: 'string', multiple: true },
  json: { type: 'boolean' },
  markdown: { type: 'boolean' },
  junit: { type: 'boolean' },
  strict: { type: 'boolean' },
  'fail-on': { type: 'string' },
  verbose: { type: 'boolean' },
  quiet: { type: 'boolean' },
  'no-color': { type: 'boolean' },
  offline: { type: 'boolean' },
  old: { type: 'string' },
  new: { type: 'string' },
});

const FLAG_NAMES = Object.keys(OPTIONS).map((k) => `--${k}`);

/**
 * @param {string} flag
 * @param {string | undefined} raw
 * @param {number} min
 * @param {number} max
 */
function intFlag(flag, raw, min, max) {
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw.trim())) throw new UsageError(`${flag} must be an integer, got "${raw}"`);
  const n = Number(raw);
  if (n < min || n > max) throw new UsageError(`${flag} must be between ${min} and ${max}, got ${n}`);
  return n;
}

/**
 * Parse "name[:file]" (split on the first ":" only, so Windows paths work).
 * @param {string} spec
 * @returns {{ name: string, file: string | null }}
 */
export function parseReporterSpec(spec) {
  const idx = spec.indexOf(':');
  const name = (idx === -1 ? spec : spec.slice(0, idx)).trim();
  const file = idx === -1 ? null : spec.slice(idx + 1).trim() || null;
  if (!REPORTERS.includes(name)) {
    const s = closest(name, REPORTERS);
    throw new UsageError(`unknown reporter "${name}"`, { hint: s ? `Did you mean "${s}"?` : `Use one of: ${REPORTERS.join(', ')}.` });
  }
  return { name, file };
}

/** @param {{ name: string, file: string | null }[]} list */
export function assertSingleStdout(list) {
  if (list.filter((r) => !r.file).length > 1) {
    throw new UsageError('only one reporter can write to stdout; give the others a file, e.g. --reporter junit:rg.xml');
  }
}

/**
 * Parse argv into a command, CLI options (config-shaped) and CLI-only flags.
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} env
 */
export function parseCli(argv, env = {}) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (/** @type {any} */ err) {
    if (err?.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
      const m = /Unknown option '([^']+)'/.exec(err.message);
      const flag = m ? m[1].split('=')[0] : '';
      const s = flag ? closest(flag, FLAG_NAMES) : null;
      throw new UsageError(`unknown option ${flag || err.message}`, { hint: s ? `Did you mean ${s}?` : undefined });
    }
    if (err?.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
      throw new UsageError(err.message.replace(/\.$/, '').replace(/^Option '([^']+)'.*argument missing$/, 'option $1 needs a value'));
    }
    if (err?.code === 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL') throw new UsageError(err.message);
    throw err;
  }
  const v = parsed.values;
  const positionals = [...parsed.positionals];
  let command = 'check';
  if (positionals[0] === 'check' || positionals[0] === 'diff') command = /** @type {string} */ (positionals.shift());
  if (positionals.length > 1) throw new UsageError(`unexpected arguments: ${positionals.slice(1).join(' ')}`, { hint: 'Give one map file, or use --sitemap.' });

  if (v.quiet && v.verbose) throw new UsageError('--quiet and --verbose cannot be used together');
  if (v.strict && v['fail-on'] === 'error') throw new UsageError('--strict and --fail-on error conflict; use one of them');
  if (v['fail-on'] !== undefined && v['fail-on'] !== 'error' && v['fail-on'] !== 'warn') {
    throw new UsageError(`--fail-on must be "error" or "warn", got "${v['fail-on']}"`);
  }
  if (command === 'check' && (v.old || v.new || v.offline)) {
    throw new UsageError('--old, --new and --offline only apply to "redirect-guard diff"');
  }

  /** @type {Record<string, any>} */
  const options = {};
  if (v.base !== undefined) options.base = v.base;
  if (v.sitemap !== undefined) options.sitemap = v.sitemap;
  if (v['host-rewrite']) {
    options.hostRewrite = {};
    for (const pair of v['host-rewrite']) {
      const idx = pair.indexOf('=');
      if (idx === -1) throw new UsageError(`--host-rewrite expects <from>=<to>, got "${pair}"`, { hint: 'Example: --host-rewrite https://www.example.com=https://staging.example.com' });
      const from = pair.slice(0, idx).trim();
      const to = pair.slice(idx + 1).trim();
      for (const u of [from, to]) {
        try {
          if (!/^https?:$/.test(new URL(u).protocol)) throw new Error();
        } catch {
          throw new UsageError(`--host-rewrite: "${u}" is not an http(s) origin`);
        }
      }
      options.hostRewrite[from] = to;
    }
  }
  if (v['expect-status'] !== undefined) {
    const list = v['expect-status'].split(/[\s,|]+/).filter(Boolean);
    if (!list.length || list.some((s) => !/^3\d\d$/.test(s))) throw new UsageError(`--expect-status expects 3xx codes such as 301,308, got "${v['expect-status']}"`);
    options.expectStatus = list.map(Number);
  }
  options.maxHops = intFlag('--max-hops', v['max-hops'], 0, 50);
  options.maxRedirects = intFlag('--max-redirects', v['max-redirects'], 1, 50);
  options.concurrency = intFlag('--concurrency', v.concurrency, 1, 32);
  options.delay = intFlag('--delay', v.delay, 0, 600000);
  options.timeout = intFlag('--timeout', v.timeout, 1, 600000);
  options.retries = intFlag('--retries', v.retries, 0, 5);
  options.limit = intFlag('--limit', v.limit, 1, Number.MAX_SAFE_INTEGER);
  if (v['user-agent'] !== undefined) options.userAgent = v['user-agent'];
  if (v['robots-agent'] !== undefined) options.robotsAgent = v['robots-agent'];
  if (v['no-indexability']) options.indexability = false;
  if (v['no-robots']) options.robots = false;
  if (v.include) options.include = v.include;
  if (v.exclude) options.exclude = v.exclude;
  if (v.strict) options.failOn = 'warn';
  else if (v['fail-on']) options.failOn = v['fail-on'];

  /** @type {Record<string, string>} */
  const headers = {};
  for (const h of v.header ?? []) {
    const idx = h.indexOf(':');
    if (idx <= 0) throw new UsageError(`--header expects "Name: value", got "${h}"`);
    const name = h.slice(0, idx).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) throw new UsageError(`--header: "${name}" is not a valid header name`);
    try {
      headers[name] = expandEnvString(h.slice(idx + 1).trim(), env, `--header ${name}`);
    } catch (/** @type {any} */ err) {
      throw new UsageError(err.message, { hint: err.hint });
    }
  }
  if (v['auth-env'] !== undefined) {
    const name = v['auth-env'];
    const value = env[name];
    if (value === undefined || value === '') {
      throw new UsageError(`environment variable ${name} is not set`, { hint: `Referenced by --auth-env ${name}.` });
    }
    if (!value.includes(':')) throw new UsageError(`environment variable ${name} must hold user:password`, { hint: `Referenced by --auth-env ${name}.` });
    headers.Authorization = `Basic ${Buffer.from(value, 'utf8').toString('base64')}`;
  }
  if (Object.keys(headers).length) options.headers = headers;

  /** @type {{ name: string, file: string | null }[] | null} */
  let reporters = null;
  const specs = [...(v.reporter ?? [])];
  if (v.json) specs.push('json');
  if (v.markdown) specs.push('markdown');
  if (v.junit) specs.push('junit');
  if (specs.length) {
    reporters = specs.map(parseReporterSpec);
    assertSingleStdout(reporters);
  }

  for (const k of Object.keys(options)) if (options[k] === undefined) delete options[k];

  return {
    command,
    map: positionals[0] ?? null,
    options,
    reporters,
    help: Boolean(v.help),
    version: Boolean(v.version),
    configPath: v.config ?? null,
    noConfig: Boolean(v['no-config']),
    verbose: Boolean(v.verbose),
    quiet: Boolean(v.quiet),
    noColor: Boolean(v['no-color']),
    old: v.old ?? null,
    new: v.new ?? null,
    offline: Boolean(v.offline),
  };
}
