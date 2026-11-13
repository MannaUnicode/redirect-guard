import { painter, symbols, visibleLength } from './ansi.js';
import { RULES, DOCS_URL } from '../checks/rules.js';
import { exitCodeFor } from '../engine.js';

/** Rules whose presence means the chain itself must be shown. */
const CHAIN_RULES = new Set([
  'wrong-destination',
  'status-not-permanent',
  'chain-too-long',
  'trailing-slash-hop',
  'redirect-loop',
  'too-many-redirects',
  'no-redirect',
  'unexpected-status',
  'target-not-ok',
  'request-failed',
  'sitemap-url-redirects',
  'orphan-url',
  'redirect-to-homepage',
]);

/**
 * Word-wrap prose (never URLs on their own) to `width`, indenting continuation lines.
 * @param {string} text
 * @param {number} width
 * @param {number} indent
 */
function wrap(text, width, indent) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  const max = Math.max(20, width - indent);
  for (const w of words) {
    if (line && line.length + 1 + w.length > max) {
      lines.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(line);
  return lines.join(`\n${' '.repeat(indent)}`);
}

/** @param {number} n @param {string} one @param {string} [many] */
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * @param {any} report
 * @param {{ color?: boolean, unicode?: boolean, verbose?: boolean, quiet?: boolean, columns?: number, failOn?: 'error' | 'warn' }} [opts]
 */
export function formatText(report, opts = {}) {
  const p = painter(Boolean(opts.color));
  const sym = symbols(opts.unicode !== false);
  const verbose = Boolean(opts.verbose);
  const quiet = Boolean(opts.quiet);
  const columns = opts.columns && opts.columns > 40 ? opts.columns : 100;
  const width = Math.min(columns, 120);
  const failOn = opts.failOn ?? report.options?.failOn ?? 'error';
  const base = report.options?.base ?? null;
  const baseOrigin = base ? new URL(base).origin : null;
  const { summary } = report;
  const secs = `${(report.durationMs / 1000).toFixed(1)}s`;
  const exit = exitCodeFor(report, failOn);
  /** @type {string[]} */
  const out = [];

  const disp = (/** @type {string | null} */ url, /** @type {string | null} */ ref) => {
    if (!url) return '';
    try {
      const u = new URL(url);
      const r = baseOrigin ?? ref;
      return r && u.origin === r ? u.pathname + u.search + u.hash : u.href;
    } catch {
      return url;
    }
  };
  const status = (/** @type {number | null} */ s) => {
    if (s == null) return p.sBad('ERR');
    const t = String(s);
    if (s >= 200 && s < 300) return p.s2xx(t);
    if (s === 301 || s === 308) return p.sPermanent(t);
    if (s >= 300 && s < 400) return p.sTemporary(t);
    return p.sBad(t);
  };
  const badge = (/** @type {string} */ st) => (st === 'fail' ? p.failBadge(' FAIL ') : st === 'warn' ? p.warnBadge(' WARN ') : p.okBadge('  OK  '));
  const issueSym = (/** @type {any} */ i) => (i.severity === 'error' ? p.error(sym.error) : p.warn(sym.warn));
  const ruleName = (/** @type {any} */ i, /** @type {number} */ pad) => {
    const s = i.rule.padEnd(pad);
    return i.severity === 'error' ? p.error(s) : p.warn(s);
  };

  // ---- header
  if (!quiet) {
    const parts = [`redirect-guard ${report.tool.version}`, plural(summary.total, 'URL')];
    if (report.input?.label) parts[1] += ` from ${report.input.label}`;
    if (base) parts.push(`base ${base}`);
    out.push(parts.join(` ${sym.sep} `));
    const ctx = [];
    const targets = Object.values(report.options?.hostRewrite ?? {});
    if (targets.length) ctx.push(`testing against ${targets.join(', ')} (host rewrite)`);
    if (report.input?.kind === 'sitemap' && !base) ctx.push('checking URLs on their original host (no --base given)');
    if (verbose || report.options?.robotsAgent !== 'googlebot') ctx.push(`robots agent ${report.options?.robotsAgent}`);
    if (report.options?.indexability === false) ctx.push('indexability checks off');
    else if (report.options?.robots === false) ctx.push('robots.txt check off');
    if (verbose || report.options?.concurrency !== 4) ctx.push(`concurrency ${report.options?.concurrency}`);
    if (ctx.length) out.push(p.dim(`  ${ctx.join(` ${sym.sep} `)}`));
    if (report.diff) {
      const d = report.diff;
      out.push(`  diff: ${d.kept} kept ${sym.sep} ${d.removed} removed ${sym.sep} ${d.added} added`);
    }
    out.push('');
  }

  // ---- clean run
  if (summary.fail === 0 && summary.warn === 0 && !verbose) {
    if (report.diff && !quiet) appendDiffLists(out, report, p, sym);
    out.push(` ${p.ok(sym.ok)} All ${plural(summary.total, 'entry', 'entries')} pass. 0 warnings. ${secs}. Exit code 0.`);
    return `${out.join('\n')}\n`;
  }

  const isGroupOnly = (/** @type {any} */ r) => r.issues.length > 0 && r.issues.every((i) => RULES[/** @type {keyof typeof RULES} */ (i.rule)]?.group);
  const ordered = [
    ...report.results.filter((/** @type {any} */ r) => r.status === 'fail'),
    ...(quiet ? [] : report.results.filter((/** @type {any} */ r) => r.status === 'warn')),
    ...(verbose && !quiet ? report.results.filter((/** @type {any} */ r) => r.status === 'ok') : []),
  ].filter((r) => !isGroupOnly(r));

  const IND = '         ';
  const ARROW = sym.arrow.length === 1 ? `       ${sym.arrow} ` : `      ${sym.arrow} `;

  for (const r of ordered) {
    const ref = (() => {
      try {
        return new URL(r.from).origin;
      } catch {
        return null;
      }
    })();
    const title = baseOrigin ? disp(r.from, ref) : r.from;

    if (quiet) {
      const ids = r.issues.map((/** @type {any} */ i) => `${issueSym(i)} ${i.severity === 'error' ? p.error(i.rule) : p.warn(i.rule)}`).join(' ');
      out.push(`${badge(r.status)} ${p.bold(title.padEnd(18))} ${ids}`);
      continue;
    }

    const needsChain = r.issues.some((/** @type {any} */ i) => CHAIN_RULES.has(i.rule));
    if (r.status === 'warn' && !needsChain && r.chain.length <= 2 && !verbose) {
      const hop = r.chain[0];
      const finalUrl = r.final ? disp(r.final.url, ref) : '';
      const chainTxt = r.chain.length === 2 ? `  ${p.dim(sym.arrow)} ${status(hop.status)} ${finalUrl}` : `  ${status(hop.status)}`;
      const ids = r.issues.map((/** @type {any} */ i) => `${issueSym(i)} ${p.warn(i.rule)}`).join(' ');
      out.push(`${badge(r.status)} ${p.bold(title)}${chainTxt}   ${ids}`);
      out.push('');
      continue;
    }

    const left = `${badge(r.status)} ${p.bold(title)}`;
    const src = r.source ?? '';
    const gap = width - visibleLength(left) - src.length;
    if (src && gap >= 2) out.push(`${left}${' '.repeat(gap)}${p.dim(src)}`);
    else {
      out.push(left);
      if (src) out.push(`${IND}${p.dim(src)}`);
    }

    // chain
    const hopText = (/** @type {any} */ h) => {
      if (h.error) return `${status(null)}  ${disp(h.url, ref)}  ${h.error.code} after ${plural(h.attempts, 'attempt')}`;
      let t = `${status(h.status)}  ${disp(h.url, ref)}`;
      if (verbose) {
        if (h.durationMs != null) t += `  ${p.dim(`${h.durationMs} ms`)}`;
        if (h.attempts > 1) t += `  ${p.dim(`${h.attempts} attempts`)}`;
        if (h.requestedUrl) t += `  ${p.dim(`via ${h.requestedUrl}`)}`;
      }
      return t;
    };
    const chain = r.chain;
    const inline = `${IND}${chain.map((/** @type {any} */ h, /** @type {number} */ i) => (i === 0 ? hopText(h) : `${status(h.status)} ${disp(h.url, ref)}`)).join(`  ${p.dim(sym.arrow)} `)}`;
    if (r.status === 'warn' && !verbose && chain.length > 1 && !chain.some((/** @type {any} */ h) => h.error) && visibleLength(inline) <= columns) {
      out.push(inline);
    } else {
      chain.forEach((/** @type {any} */ h, /** @type {number} */ i) => {
        out.push(`${i === 0 ? IND : p.dim(ARROW)}${hopText(h)}`);
      });
    }
    if (verbose && r.final?.indexability && r.status === 'ok') {
      const ix = r.final.indexability;
      const notes = [];
      if (ix.canonical) notes.push(ix.canonical === r.final.url ? 'canonical self' : `canonical ${disp(ix.canonical, ref)}`);
      if (ix.robotsAllowed === true) notes.push('robots allowed');
      if (notes.length) out.push(`${IND}${p.dim(notes.join(` ${sym.sep} `))}`);
    }
    if (r.issues.some((/** @type {any} */ i) => i.rule === 'wrong-destination') && r.expected.to) {
      out.push(`${IND}${p.dim('expected')} ${disp(r.expected.to, ref)}`);
    }

    // issues
    const pad = Math.max(...r.issues.map((/** @type {any} */ i) => i.rule.length), 0);
    const msgIndent = IND.length + 2 + pad + 2;
    const hinted = new Set();
    for (const i of r.issues) {
      out.push(`${IND}${issueSym(i)} ${ruleName(i, pad)}  ${wrap(i.message, width, msgIndent)}`);
      const missingRedirect = i.rule === 'target-not-ok' && r.chain.length === 1 && r.expected.mode === 'redirect';
      const info = RULES[/** @type {keyof typeof RULES} */ (missingRedirect ? 'no-redirect' : i.rule)];
      if (r.status === 'fail' && i.severity === 'error' && info?.hint && !hinted.has(i.rule)) {
        hinted.add(i.rule);
        const hint = info.hint
          .replaceAll('{from}', title)
          .replaceAll('{to}', r.expected.to ? disp(r.expected.to, ref) : 'its new URL')
          .replaceAll('{final}', r.final ? disp(r.final.url, ref) : 'the final URL');
        out.push(`${IND}  ${p.dim(wrap(hint, width, IND.length + 2))}`);
      }
    }
    out.push('');
  }

  // ---- group blocks
  if (!quiet) {
    for (const g of report.groups?.collapse ?? []) {
      const members = report.results.filter((/** @type {any} */ r) => g.ids.includes(r.id));
      const t = disp(g.target, null);
      const left = `${badge('warn')} ${p.bold(`${g.count} URLs end at ${t}`)}`;
      const tag = 'redirect-collapse';
      const gap = width - visibleLength(left) - tag.length;
      out.push(gap >= 2 ? `${left}${' '.repeat(gap)}${p.dim(tag)}` : left);
      const froms = members.map((/** @type {any} */ r) => disp(r.from, new URL(r.from).origin));
      if (verbose) {
        for (const f of froms) out.push(`${IND}${f}`);
      } else {
        const shown = froms.slice(0, 4).join(', ');
        out.push(`${IND}${shown}${froms.length > 4 ? ` and ${froms.length - 4} more` : ''}`);
      }
      const root = (() => {
        try {
          return new URL(g.target).pathname === '/';
        } catch {
          return false;
        }
      })();
      out.push(`${IND}${p.dim(wrap(root ? 'Old pages redirected to the homepage may be treated as soft 404s.' : 'Many old pages redirected to one page may be treated as soft 404s.', width, IND.length))}`);
      if (!verbose && froms.length > 4) out.push(`${IND}${p.dim('Run with --verbose to list all of them.')}`);
      out.push('');
    }
    if (report.diff) appendDiffLists(out, report, p, sym);
  }

  // ---- summary
  const counts = ` ${summary.total} checked ${sym.sep} ${p.ok(`${summary.ok} ok`)} ${sym.sep} ${summary.warn ? p.warn(`${summary.warn} warn`) : '0 warn'} ${sym.sep} ${summary.fail ? p.error(`${summary.fail} fail`) : '0 fail'} ${sym.sep} ${p.dim(secs)}`;
  if (!quiet) out.push(p.dim(sym.rule.repeat(Math.min(width, 78))));
  out.push(counts);
  const ruleEntries = Object.entries(summary.byRule ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!quiet && ruleEntries.length) {
    out.push('');
    out.push(' Top issues');
    const pad = Math.max(...ruleEntries.map(([k]) => k.length));
    const sev = (/** @type {string} */ rule) => {
      for (const r of report.results) for (const i of r.issues) if (i.rule === rule) return i.severity;
      return 'warn';
    };
    for (const [rule, n] of ruleEntries.slice(0, 8)) {
      const s = sev(rule);
      out.push(`   ${rule.padEnd(pad)}  ${String(n).padStart(4)}  ${s === 'error' ? p.error(s) : p.warn(s)}`);
    }
  }
  if (!quiet) out.push('');

  // ---- verdict
  if (summary.fail > 0) {
    out.push(` ${p.error(sym.error)} ${plural(summary.fail, 'entry', 'entries')} failed. Exit code ${exit}.`);
  } else if (exit === 1) {
    out.push(` ${p.error(sym.error)} ${plural(summary.warn, 'entry', 'entries')} with warnings (--strict). Exit code 1.`);
  } else if (summary.warn > 0) {
    out.push(` ${p.ok(sym.ok)} No failures. ${plural(summary.warn, 'warning')} (use --strict to fail on warnings). Exit code 0.`);
  } else {
    out.push(` ${p.ok(sym.ok)} All ${plural(summary.total, 'entry', 'entries')} pass. Exit code 0.`);
  }
  if (!quiet && ruleEntries.length) out.push(` Rule docs: ${DOCS_URL}`);
  return `${out.join('\n')}\n`;
}

/**
 * @param {string[]} out
 * @param {any} report
 * @param {ReturnType<typeof painter>} p
 * @param {ReturnType<typeof symbols>} sym
 */
function appendDiffLists(out, report, p, sym) {
  const d = report.diff;
  const cap = 1000;
  for (const [label, list] of [
    ['Removed from the sitemap', d.removedUrls],
    ['Added to the sitemap', d.addedUrls],
  ]) {
    if (!list.length) continue;
    out.push(` ${label} (${list.length})`);
    for (const u of list.slice(0, cap)) out.push(`   ${p.dim(sym.sep)} ${u}`);
    if (list.length > cap) out.push(`   ${p.dim(`and ${list.length - cap} more (see --json for the full list)`)}`);
    out.push('');
  }
}
