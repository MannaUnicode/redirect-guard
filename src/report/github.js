const MAX_PER_LEVEL = 50;

/** Escape the message part of a workflow command. @param {string} s */
export function escapeData(s) {
  return String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** Escape a property value of a workflow command. @param {string} s */
export function escapeProperty(s) {
  return escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

/**
 * GitHub Actions workflow commands (::error / ::warning) placed on the map line.
 * @param {any} report
 */
export function formatGithub(report) {
  const lines = [];
  /** @type {Record<string, number>} */
  const counts = { error: 0, warning: 0 };
  /** @type {Record<string, number>} */
  const dropped = { error: 0, warning: 0 };
  for (const r of report.results) {
    let path = r.from;
    try {
      const u = new URL(r.from);
      path = u.pathname + u.search;
    } catch {
      /* raw */
    }
    const m = /^(.*):(\d+)$/.exec(r.source ?? '');
    for (const i of r.issues) {
      const level = i.severity === 'error' ? 'error' : 'warning';
      if (counts[level] >= MAX_PER_LEVEL) {
        dropped[level]++;
        continue;
      }
      counts[level]++;
      const props = [];
      if (m) props.push(`file=${escapeProperty(m[1])}`, `line=${m[2]}`);
      props.push(`title=${escapeProperty(i.rule)}`);
      lines.push(`::${level} ${props.join(',')}::${escapeData(`${path} ${i.message}`)}`);
    }
  }
  if (dropped.error || dropped.warning) {
    lines.push(`::notice title=redirect-guard::${escapeData(`${dropped.error} more errors and ${dropped.warning} more warnings not annotated (limit ${MAX_PER_LEVEL} per level). See the full report.`)}`);
  }
  return lines.length ? `${lines.join('\n')}\n` : '';
}
