/**
 * Escape text for XML 1.0 and strip characters that are invalid in it.
 * @param {unknown} s
 */
export function xmlEscape(s) {
  return String(s ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x09\x0A\x0D\x20-퟿-�\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** @param {any} r */
function chainText(r) {
  return r.chain
    .map((/** @type {any} */ h) => (h.error ? `ERR ${h.url} ${h.error.code}: ${h.error.message}` : `${h.status} ${h.url}`))
    .join('\n-> ');
}

/**
 * JUnit XML: one testcase per entry; errors become <failure>, warnings go
 * to <system-out> (or <failure> with failOn "warn").
 * @param {any} report
 * @param {{ failOn?: 'error' | 'warn' }} [opts]
 */
export function formatJunit(report, opts = {}) {
  const strict = (opts.failOn ?? report.options?.failOn) === 'warn';
  const cases = [];
  let failures = 0;
  for (const r of report.results) {
    let classname = 'redirect-guard';
    let name = r.from;
    try {
      const u = new URL(r.from);
      classname = u.origin;
      name = u.pathname + u.search;
    } catch {
      /* keep raw */
    }
    const time = (r.chain.reduce((/** @type {number} */ t, /** @type {any} */ h) => t + (h.durationMs ?? 0), 0) / 1000).toFixed(3);
    const errors = r.issues.filter((/** @type {any} */ i) => i.severity === 'error');
    const warns = r.issues.filter((/** @type {any} */ i) => i.severity === 'warn');
    const failing = strict ? [...errors, ...warns] : errors;
    let inner = '';
    if (failing.length) {
      failures++;
      const first = failing[0];
      const body = [`${r.source}`, ...failing.map((/** @type {any} */ i) => `[${i.severity}] ${i.rule}: ${i.message}`), '', chainText(r)].join('\n');
      inner += `\n      <failure type="${xmlEscape(first.rule)}" message="${xmlEscape(failing.map((/** @type {any} */ i) => `${i.rule}: ${i.message}`).join('; '))}">${xmlEscape(body)}</failure>`;
    }
    if (!strict && warns.length) {
      inner += `\n      <system-out>${xmlEscape(warns.map((/** @type {any} */ i) => `[warn] ${i.rule}: ${i.message}`).join('\n'))}</system-out>`;
    }
    cases.push(
      `    <testcase classname="${xmlEscape(classname)}" name="${xmlEscape(name)}" time="${time}"${inner ? `>${inner}\n    </testcase>` : ' />'}`,
    );
  }
  const time = (report.durationMs / 1000).toFixed(3);
  const n = report.results.length;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="redirect-guard" tests="${n}" failures="${failures}" time="${time}">`,
    `  <testsuite name="redirect-guard" tests="${n}" failures="${failures}" errors="0" skipped="0" time="${time}" timestamp="${xmlEscape(report.startedAt)}">`,
    ...cases,
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n');
}
