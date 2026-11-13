import { rowToEntry } from './entry.js';

/**
 * One URL or path per line; "#" comments and blank lines are skipped.
 * @param {string} text
 * @param {{ file?: string, base?: string | null }} [opts]
 */
export function parseTextList(text, opts = {}) {
  const file = opts.file ?? 'input';
  const out = [];
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith('#')) continue;
    out.push(rowToEntry({ from: t }, { base: opts.base, source: `${file}:${i + 1}` }));
  }
  return out;
}
