import { decodeEntities } from './entities.js';

const MAX_SCAN = 512 * 1024;

/**
 * Parse the attributes of a start tag body.
 * @param {string} s
 * @returns {Record<string, string>}
 */
function parseAttributes(s) {
  /** @type {Record<string, string>} */
  const attrs = {};
  const re = /([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(s))) {
    const name = m[1].toLowerCase();
    if (name in attrs) continue;
    const raw = m[2] ?? m[3] ?? m[4] ?? '';
    attrs[name] = decodeEntities(raw);
  }
  return attrs;
}

/**
 * Scan the <head> of an HTML document for robots meta tags and canonical links.
 * Bounded to the content before </head> (or the first 512 KB).
 * @param {string} html
 * @returns {{ robots: string[], canonical: string | null, canonicals: string[], meta: { name: string, content: string }[] }}
 */
export function extractHeadSignals(html) {
  let s = String(html ?? '').slice(0, MAX_SCAN);
  s = s.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  s = s.replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, '');
  const headEnd = s.search(/<\/head\s*>|<body\b/i);
  if (headEnd !== -1) s = s.slice(0, headEnd);

  /** @type {{ name: string, content: string }[]} */
  const meta = [];
  /** @type {string[]} */
  const canonicals = [];
  const tagRe = /<(meta|link)\b([^>]*)>/gi;
  let m;
  while ((m = tagRe.exec(s))) {
    const tag = m[1].toLowerCase();
    const attrs = parseAttributes(m[2]);
    if (tag === 'meta') {
      const name = (attrs.name || '').trim().toLowerCase();
      if (name && 'content' in attrs) meta.push({ name, content: attrs.content.trim() });
    } else {
      const rel = (attrs.rel || '').toLowerCase().split(/\s+/);
      if (rel.includes('canonical') && attrs.href !== undefined && attrs.href.trim() !== '') {
        canonicals.push(attrs.href.trim());
      }
    }
  }
  return {
    robots: meta.filter((x) => x.name === 'robots' || x.name === 'googlebot').map((x) => x.content),
    canonical: canonicals[0] ?? null,
    canonicals,
    meta,
  };
}
