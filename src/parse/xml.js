import { InputError } from '../errors.js';
import { decodeEntities } from './entities.js';

/**
 * Minimal, tolerant sitemap reader. Only <urlset>/<sitemapindex> and their
 * unprefixed <loc> elements are read; everything else (image:loc, lastmod...) is ignored.
 * @param {string} text
 * @param {string} [label]
 * @returns {{ type: 'urlset' | 'sitemapindex', locs: string[] }}
 */
export function parseSitemapXml(text, label = 'sitemap') {
  const s = String(text)
    .replace(/^﻿/, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const root = /<(?:[\w.-]+:)?(urlset|sitemapindex)\b/i.exec(s);
  if (!root) {
    throw new InputError(`${label}: not a sitemap (no <urlset> or <sitemapindex> element found)`);
  }
  const type = /** @type {'urlset' | 'sitemapindex'} */ (root[1].toLowerCase());
  const locs = [];
  const re = /<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/gi;
  let m;
  while ((m = re.exec(s))) {
    let value = m[1].trim();
    const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(value);
    if (cdata) {
      value = cdata[1].trim();
    } else {
      if (value.includes('<')) {
        throw new InputError(`${label}: malformed <loc> element near "${value.slice(0, 60)}"`);
      }
      value = decodeEntities(value);
    }
    if (value) locs.push(value);
  }
  const opened = (s.match(/<loc\b/gi) || []).length;
  if (opened !== locs.length && opened > 0 && locs.length === 0) {
    throw new InputError(`${label}: malformed sitemap (unterminated <loc> element)`);
  }
  return { type, locs };
}
