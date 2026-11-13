/**
 * Decide color and Unicode support for one output stream.
 * Rules in order: FORCE_COLOR=0/false off; FORCE_COLOR set on; --no-color off;
 * NO_COLOR off; TERM=dumb off; isTTY on; otherwise off.
 * @param {{ isTTY?: boolean } | null | undefined} stream
 * @param {Record<string, string | undefined>} env
 * @param {{ noColor?: boolean, platform?: string }} [opts]
 * @returns {{ color: boolean, unicode: boolean }}
 */
export function capabilities(stream, env, opts = {}) {
  return { color: colorSupport(stream, env, opts), unicode: unicodeSupport(env, opts.platform ?? process.platform) };
}

/**
 * @param {{ isTTY?: boolean } | null | undefined} stream
 * @param {Record<string, string | undefined>} env
 * @param {{ noColor?: boolean }} [opts]
 */
export function colorSupport(stream, env, opts = {}) {
  if ('FORCE_COLOR' in env && env.FORCE_COLOR !== undefined) {
    const v = String(env.FORCE_COLOR).toLowerCase();
    if (v === '0' || v === 'false') return false;
    if (['', '1', '2', '3', 'true'].includes(v)) return true;
  }
  if (opts.noColor) return false;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.TERM === 'dumb') return false;
  return Boolean(stream && stream.isTTY);
}

/**
 * Same heuristic as is-unicode-supported, inlined.
 * @param {Record<string, string | undefined>} env
 * @param {string} platform
 */
export function unicodeSupport(env, platform) {
  if (platform !== 'win32') return env.TERM !== 'linux';
  return (
    Boolean(env.WT_SESSION) ||
    Boolean(env.TERMINUS_SUBLIME) ||
    env.ConEmuTask === '{cmd::Cmder}' ||
    env.TERM_PROGRAM === 'vscode' ||
    env.TERM === 'xterm-256color' ||
    env.TERM === 'alacritty' ||
    env.TERMINAL_EMULATOR === 'JetBrains-JediTerm' ||
    Boolean(env.CI)
  );
}

const SGR = {
  failBadge: '1;97;41',
  warnBadge: '1;30;43',
  okBadge: '1;30;42',
  error: '1;31',
  warn: '1;33',
  ok: '32',
  s2xx: '32',
  sPermanent: '36',
  sTemporary: '33',
  sBad: '31',
  bold: '1',
  dim: '2',
};

/**
 * @param {boolean} enabled
 * @returns {Record<keyof typeof SGR, (s: string) => string>}
 */
export function painter(enabled) {
  /** @type {any} */
  const p = {};
  for (const [k, code] of Object.entries(SGR)) {
    p[k] = enabled ? (/** @type {string} */ s) => `\x1b[${code}m${s}\x1b[0m` : (/** @type {string} */ s) => s;
  }
  return p;
}

/** @param {boolean} unicode */
export function symbols(unicode) {
  return unicode
    ? { error: '✖', warn: '▲', ok: '✔', arrow: '→', sep: '·', rule: '─' }
    : { error: 'x', warn: '!', ok: '+', arrow: '->', sep: '-', rule: '-' };
}

/** Visible length (ANSI codes removed). @param {string} s */
export function visibleLength(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}
