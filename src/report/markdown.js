import { DOCS_URL, RULES } from '../checks/rules.js';

export const MARKDOWN_MARKER = '<!-- redirect-guard-report -->';
const MAX_CHARS = 60_000;

/** Escape text for a Markdown table cell. @param {string} s */
export function escapeCell(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/`/g, "'").replace(/\r?\n/g, ' ').replace(/</g, '&lt;');
}

/** Inline code that cannot break out of its span. @param {string} s */
const code = (s) => `\`${String(s).replace(/`/g, "'").replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')}\``;

/**
 * Markdown for PR comments and $GITHUB_STEP_SUMMARY.
 * @param {any} report
 */
export function formatMarkdown(report) {
  const base = report.options?.base ?? null;
  const baseOrigin = base ? new URL(base).origin : null;
  const disp = (/** @type {string | null} */ url, /** @type {string} */ from) => {
    if (!url) return '';
    try {
      const u = new URL(url);
      const ref = baseOrigin ?? new URL(from).origin;
      return u.origin === ref ? u.pathname + u.search + u.hash : u.href;
    } catch {
      return url;
    }
  };
  const s = report.summary;
  const secs = `${(report.durationMs / 1000).toFixed(1)}s`;
  const head = [];
  head.push(MARKDOWN_MARKER);
  const title = s.fail || s.warn ? `${s.fail} failing, ${s.warn} warning${s.warn === 1 ? '' : 's'}` : `all ${s.total} passing`;
  head.push(`### redirect-guard: ${title}`);
  head.push('');
  head.push('| Checked | OK | Warn | Fail | Time |');
  head.push('|---:|---:|---:|---:|---:|');
  head.push(`| ${s.total} | ${s.ok} | ${s.warn} | ${s.fail} | ${secs} |`);
  head.push('');
  if (report.diff) {
    const d = report.diff;
    head.push(`Sitemap diff: ${d.kept} kept · ${d.removed} removed · ${d.added} added`);
    head.push('');
  }

  const chainCell = (/** @type {any} */ r) => {
    const hops = r.chain;
    if (hops.length === 0) return '';
    if (hops[hops.length - 1].error) {
      const e = hops[hops.length - 1].error;
      return `ERR ${escapeCell(e.code)}`;
    }
    return hops
      .map((/** @type {any} */ h, /** @type {number} */ i) => (i === 0 ? `${h.status}` : `${h.status} ${code(disp(h.url, r.from))}`))
      .join(' → ');
  };
  const issuesCell = (/** @type {any} */ r) =>
    r.issues
      .filter((/** @type {any} */ i) => !RULES[/** @type {keyof typeof RULES} */ (i.rule)]?.group || r.issues.length === 1)
      .map((/** @type {any} */ i) => (i.severity === 'error' ? `**${i.rule}** ${escapeCell(i.message)}` : `${i.rule}: ${escapeCell(i.message)}`))
      .join(' · ');

  const rows = (/** @type {any[]} */ list) => list.map((r) => `| ${code(disp(r.from, r.from))} | ${chainCell(r)} | ${issuesCell(r)} |`);
  const fails = report.results.filter((/** @type {any} */ r) => r.status === 'fail');
  const isGroupOnly = (/** @type {any} */ r) => r.issues.every((/** @type {any} */ i) => RULES[/** @type {keyof typeof RULES} */ (i.rule)]?.group);
  const warns = report.results.filter((/** @type {any} */ r) => r.status === 'warn' && !isGroupOnly(r));

  const body = [];
  if (fails.length) {
    body.push('**Failures**', '', '| From | Chain | Issues |', '|---|---|---|', ...rows(fails), '');
  }
  const groups = report.groups?.collapse ?? [];
  if (warns.length || groups.length) {
    body.push(`<details><summary>${s.warn} warning${s.warn === 1 ? '' : 's'}</summary>`, '', '| From | Chain | Issues |', '|---|---|---|', ...rows(warns));
    for (const g of groups) {
      body.push(`| ${g.count} URLs | → ${code(disp(g.target, g.target))} | redirect-collapse: may be treated as soft 404s |`);
    }
    body.push('', '</details>', '');
  }
  const foot = `<sub>redirect-guard ${report.tool.version}${base ? ` · base ${base}` : ''} · [rule docs](${DOCS_URL})</sub>`;

  let text = `${head.join('\n')}\n${body.join('\n')}\n${foot}\n`;
  if (text.length > MAX_CHARS) {
    const note = `\n_Output truncated: showing the first part of ${report.results.length} results. Use --reporter json for everything._\n\n`;
    let cut = text.slice(0, MAX_CHARS - note.length - foot.length - 2);
    cut = cut.slice(0, cut.lastIndexOf('\n'));
    if (cut.includes('<details>') && !cut.includes('</details>')) cut += '\n\n</details>';
    text = `${cut}\n${note}${foot}\n`;
  }
  return text;
}
