import { extractHeadSignals } from '../parse/html-head.js';

const VALUE_DIRECTIVES = new Set(['max-snippet', 'max-image-preview', 'max-video-preview', 'unavailable_after']);

/**
 * Directives of an X-Robots-Tag value that apply to `agent`: the ones without a
 * user-agent prefix, plus the ones prefixed with the agent ("googlebot: noindex").
 * @param {string | null | undefined} value
 * @param {string} agent
 */
export function parseXRobotsTag(value, agent) {
  if (!value) return [];
  const a = agent.toLowerCase();
  /** @type {string[]} */
  const out = [];
  /** @type {string | null} */
  let current = null;
  for (let part of value.split(',')) {
    part = part.trim();
    if (!part) continue;
    const m = /^([a-z0-9_.-]+)\s*:\s*(.*)$/i.exec(part);
    if (m && !VALUE_DIRECTIVES.has(m[1].toLowerCase())) {
      current = m[1].toLowerCase();
      part = m[2].trim();
      if (!part) continue;
    }
    if (current === null || current === a) out.push(part.toLowerCase());
  }
  return out;
}

/**
 * First rel=canonical target in a Link header.
 * @param {string | null | undefined} value
 */
export function parseLinkCanonical(value) {
  if (!value) return null;
  for (const part of value.split(/,(?=\s*<)/)) {
    const m = /^\s*<([^>]*)>(.*)$/s.exec(part);
    if (!m) continue;
    const rel = /;\s*rel\s*=\s*(?:"([^"]*)"|([^;\s]+))/i.exec(m[2]);
    const tokens = (rel ? rel[1] ?? rel[2] : '').toLowerCase().split(/\s+/);
    if (tokens.includes('canonical') && m[1].trim()) return m[1].trim();
  }
  return null;
}

/** @param {string} content */
const directives = (content) => content.toLowerCase().split(/[\s,]+/).filter(Boolean);

/**
 * Indexability signals of a final response.
 * @param {{ url: string, headers: Record<string, string | null>, body: string | null }} final
 * @param {{ robotsAgent?: string, toLogical?: (url: string) => string }} [opts]
 */
export function analyzeDestination(final, opts = {}) {
  const agent = (opts.robotsAgent || 'googlebot').toLowerCase();
  const toLogical = opts.toLogical ?? ((u) => u);
  const xRobotsTag = parseXRobotsTag(final.headers['x-robots-tag'], agent);
  const head = final.body ? extractHeadSignals(final.body) : { meta: [], canonicals: [], canonical: null };
  const applying = head.meta.filter((m) => m.name === 'robots' || m.name === agent);
  const robotsMeta = applying.map((m) => m.content);

  /** @type {{ source: string, value: string } | null} */
  let noindex = null;
  const xrtHit = xRobotsTag.find((d) => d === 'noindex' || d === 'none');
  if (xrtHit) {
    noindex = { source: 'X-Robots-Tag', value: xrtHit };
  } else {
    const hit = applying.find((m) => directives(m.content).some((d) => d === 'noindex' || d === 'none'));
    if (hit) noindex = { source: `meta ${hit.name}`, value: hit.content };
  }

  const resolve = (/** @type {string} */ href) => {
    try {
      return toLogical(new URL(href, final.url).href);
    } catch {
      return null;
    }
  };
  const headerCanonical = parseLinkCanonical(final.headers.link);
  const htmlCanonical = head.canonical;
  /** @type {string | null} */
  let canonical = null;
  let canonicalSource = null;
  if (headerCanonical) {
    canonical = resolve(headerCanonical);
    canonicalSource = 'Link header';
  } else if (htmlCanonical) {
    canonical = resolve(htmlCanonical);
    canonicalSource = 'link rel=canonical';
  }
  return {
    xRobotsTag,
    robotsMeta,
    noindex,
    canonical,
    canonicalSource,
    canonicalDetails: {
      header: headerCanonical,
      html: htmlCanonical,
      htmlCount: head.canonicals.length,
    },
  };
}
