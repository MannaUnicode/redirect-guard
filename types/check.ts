// Usage file type-checked by `npm run typecheck`. Not published.
import {
  check,
  diffSitemaps,
  loadMap,
  loadSitemap,
  traceRedirects,
  parseRobots,
  isAllowed,
  extractHeadSignals,
  normalizeUrl,
  formatReport,
  defineConfig,
  exitCodeFor,
  RULES,
  version,
  UsageError,
  ConfigError,
  InputError,
  type Config,
  type Report,
  type RuleId,
} from 'redirect-guard';

const config: Config = defineConfig({
  base: 'https://www.example.com',
  map: 'redirects.csv',
  hostRewrite: { 'https://www.example.com': 'https://staging.example.com' },
  rules: { 'redirect-to-homepage': 'error', 'location-relative': 'off' },
  overrides: [{ match: '/blog/**', maxHops: 2 }],
  reporters: ['text', 'junit:reports/rg.xml'],
});

async function main(): Promise<void> {
  const report: Report = await check({ ...config, onProgress: (done, total) => void `${done}/${total}` });
  const code: 0 | 1 = exitCodeFor(report, 'warn');
  const text: string = formatReport(report, 'markdown');
  for (const r of report.results) {
    const rules: RuleId[] = r.issues.map((i) => i.rule);
    void rules;
    void r.final?.indexability?.canonical;
  }
  const d = await diffSitemaps({ old: 'old.xml', new: 'https://www.example.com/sitemap.xml', offline: true });
  void d.diff?.removedUrls.length;
  const entries = await loadMap({ text: 'from,to\n/a,/b', format: 'csv' }, { base: 'https://www.example.com' });
  void entries[0].expected.mode;
  const urls: string[] = await loadSitemap('old-sitemap.xml');
  const trace = await traceRedirects('https://www.example.com/a', { maxRedirects: 5 });
  void trace.chain[0].status;
  const allowed: boolean = isAllowed(parseRobots('User-agent: *\nDisallow: /x'), '/x', 'googlebot');
  const head = extractHeadSignals('<link rel=canonical href=/x>');
  const n: string = normalizeUrl('https://A.example/x/', { ignoreTrailingSlash: true });
  const sev = RULES['wrong-destination'].severity;
  void [code, text, urls, allowed, head.canonical, n, sev, version];
  try {
    await check({ entries: [{ from: '/a', to: '/b' }], base: 'https://www.example.com' });
  } catch (err) {
    if (err instanceof UsageError || err instanceof ConfigError || err instanceof InputError) {
      const c: string = err.code;
      void c;
    }
  }
}

void main;
