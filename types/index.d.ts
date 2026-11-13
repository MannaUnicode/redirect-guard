// Type definitions for redirect-guard. Hand-written; kept in sync by test/api.test.js
// and `npm run typecheck` (types/check.ts).

export type Severity = 'error' | 'warn' | 'off';
export type IssueSeverity = 'error' | 'warn';
export type EntryStatus = 'ok' | 'warn' | 'fail';
export type MapFormat = 'csv' | 'tsv' | 'json' | 'text' | 'sitemap';
export type ReportFormat = 'text' | 'json' | 'markdown' | 'junit' | 'github';

export type RuleId =
  | 'request-failed'
  | 'redirect-loop'
  | 'too-many-redirects'
  | 'no-redirect'
  | 'wrong-destination'
  | 'status-not-permanent'
  | 'unexpected-status'
  | 'target-not-ok'
  | 'target-noindex'
  | 'canonical-mismatch'
  | 'robots-blocked'
  | 'robots-unreachable'
  | 'chain-too-long'
  | 'trailing-slash-hop'
  | 'redirect-to-homepage'
  | 'redirect-collapse'
  | 'query-dropped'
  | 'protocol-inconsistent'
  | 'host-inconsistent'
  | 'location-relative'
  | 'sitemap-url-redirects'
  | 'sitemap-url-not-indexable'
  | 'orphan-url';

export interface RuleInfo {
  severity: Severity;
  description: string;
  /** One-sentence fix with {from}/{to}/{final} placeholders. */
  hint?: string;
  /** Anchor in docs/rules.md. */
  docsUrl?: string;
  /** Cross-entry rule rendered once as a group. */
  group?: boolean;
}

export interface Override {
  /** Glob over the pathname + search of the old URL. */
  match: string;
  maxHops?: number;
  expectStatus?: number[];
  rules?: Partial<Record<RuleId, Severity>>;
  ignoreTrailingSlash?: boolean;
  ignoreQuery?: boolean;
  preserveQuery?: boolean;
  indexability?: boolean;
  robots?: boolean;
  collapseThreshold?: number;
}

export interface Config {
  $schema?: string;
  /** New site origin. Relative paths resolve against it. */
  base?: string | null;
  /** Redirect map file (CSV, TSV, JSON, TXT). */
  map?: string | null;
  /** Old sitemap URL or file. */
  sitemap?: string | null;
  /** Send requests for origin A to origin B (keys and values are origins). */
  hostRewrite?: Record<string, string>;
  expectStatus?: number[];
  maxHops?: number;
  maxRedirects?: number;
  concurrency?: number;
  delay?: number;
  timeout?: number;
  retries?: number;
  userAgent?: string | null;
  /** Sent only to in-scope origins. Values may use $env:NAME in config files. */
  headers?: Record<string, string>;
  robotsAgent?: string;
  indexability?: boolean;
  robots?: boolean;
  ignoreTrailingSlash?: boolean;
  ignoreQuery?: boolean;
  preserveQuery?: boolean;
  collapseThreshold?: number;
  include?: string[];
  exclude?: string[];
  limit?: number | null;
  failOn?: 'error' | 'warn';
  rules?: Partial<Record<RuleId, Severity>>;
  overrides?: Override[];
  /** "name" or "name:file". Used by the CLI. */
  reporters?: string[];
  maxBodyBytes?: number;
}

export interface Expected {
  to: string | null;
  status: number[] | null;
  mode: 'redirect' | 'gone' | 'any' | 'present';
}

export interface Entry {
  id: number;
  source: string;
  from: string;
  expected: Expected;
  role?: 'removed' | 'new';
}

/** A map row accepted by `check({ entries })`. */
export interface EntryInput {
  from: string;
  to?: string | null;
  status?: number | number[] | string | null;
  source?: string;
  expected?: Partial<Expected>;
}

export interface CheckOptions extends Config {
  /** Skip file loading and check these entries. */
  entries?: Array<EntryInput | Entry>;
  /** Injectable fetch (tests, proxies, custom agents). */
  fetch?: typeof fetch;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, stats: { fail: number; active: number }) => void;
  /** Base directory for relative map/sitemap paths (default: process.cwd()). */
  cwd?: string;
}

export interface DiffOptions extends CheckOptions {
  old: string;
  new: string;
  /** Only compute the set diff, no HTTP. */
  offline?: boolean;
}

export interface HopError {
  code: string;
  message: string;
}

export interface Hop {
  url: string;
  requestedUrl: string | null;
  status: number | null;
  location: string | null;
  durationMs: number | null;
  attempts: number;
  error: HopError | null;
  locationRelative?: boolean;
}

export interface Trace {
  url: string;
  chain: Hop[];
  final: {
    url: string;
    requestedUrl: string;
    status: number;
    headers: Record<string, string | null>;
    body: string | null;
  } | null;
  error: HopError | null;
  loop: boolean;
  tooMany: boolean;
}

export interface RequestOptions {
  fetch?: typeof fetch;
  headers?: Record<string, string>;
  userAgent?: string | null;
  timeout?: number;
  signal?: AbortSignal;
  cwd?: string;
}

export interface TraceOptions extends RequestOptions {
  inScope?: Set<string>;
  hostRewrite?: Record<string, string>;
  retries?: number;
  maxRedirects?: number;
  readBody?: boolean;
  maxBodyBytes?: number;
}

export interface Issue {
  rule: RuleId;
  severity: IssueSeverity;
  message: string;
  details: Record<string, unknown>;
}

export interface Indexability {
  robotsMeta: string[];
  xRobotsTag: string[];
  canonical: string | null;
  robotsAllowed: boolean | null;
}

export interface Result {
  id: number;
  source: string;
  from: string;
  role?: 'removed' | 'new';
  expected: Expected;
  status: EntryStatus;
  chain: Omit<Hop, 'locationRelative'>[];
  final: { url: string; status: number; indexability: Indexability | null } | null;
  issues: Issue[];
}

export interface Report {
  schemaVersion: 1;
  tool: { name: 'redirect-guard'; version: string };
  startedAt: string;
  durationMs: number;
  input: { kind: 'map' | 'sitemap' | 'entries' | 'diff'; label: string | null };
  options: Record<string, unknown> & { base: string | null; headers: Record<string, '***'> };
  summary: { total: number; ok: number; warn: number; fail: number; byRule: Partial<Record<RuleId, number>> };
  results: Result[];
  groups: { collapse: { target: string; count: number; ids: number[] }[] };
  diff: { kept: number; removed: number; added: number; removedUrls: string[]; addedUrls: string[] } | null;
  warnings: string[];
}

export interface RobotsRule {
  allow: boolean;
  path: string;
  re: RegExp;
  len: number;
}

export interface RobotsRules {
  groups: { agents: string[]; rules: RobotsRule[] }[];
  sitemaps: string[];
}

export interface FormatOptions {
  color?: boolean;
  unicode?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  columns?: number;
  failOn?: 'error' | 'warn';
}

export declare function check(options: CheckOptions): Promise<Report>;
export declare function diffSitemaps(options: DiffOptions): Promise<Report>;
export declare function loadMap(
  input: string | { path?: string; text?: string; format?: MapFormat },
  opts?: { base?: string | null; cwd?: string; fetch?: typeof fetch },
): Promise<Entry[]>;
export declare function loadSitemap(src: string, opts?: RequestOptions & { text?: string; inScope?: Set<string> }): Promise<string[]>;
export declare function traceRedirects(url: string, opts?: TraceOptions): Promise<Trace>;
export declare function parseRobots(text: string): RobotsRules;
export declare function isAllowed(rules: RobotsRules, url: string, agent?: string): boolean;
export declare function extractHeadSignals(html: string): {
  robots: string[];
  canonical: string | null;
  canonicals: string[];
  meta: { name: string; content: string }[];
};
export declare function normalizeUrl(url: string | URL, opts?: { ignoreTrailingSlash?: boolean; ignoreQuery?: boolean }): string;
export declare function formatReport(report: Report, format: ReportFormat, opts?: FormatOptions): string;
export declare function defineConfig<T extends Config>(config: T): T;
export declare function exitCodeFor(report: Pick<Report, 'summary'> | { summary: { fail: number; warn: number } }, failOn?: 'error' | 'warn'): 0 | 1;
export declare const RULES: Readonly<Record<RuleId, Readonly<RuleInfo>>>;
export declare const version: string;

declare class RedirectGuardError extends Error {
  hint?: string;
  frame?: string;
}
export declare class UsageError extends RedirectGuardError {
  readonly code: 'ERR_USAGE';
}
export declare class ConfigError extends RedirectGuardError {
  readonly code: 'ERR_CONFIG';
}
export declare class InputError extends RedirectGuardError {
  readonly code: 'ERR_INPUT';
}
