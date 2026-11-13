import { InputError } from '../errors.js';
import { codeFrame, lineCol } from './frame.js';
import { rowToEntry } from './entry.js';

/**
 * Parse a JSON map: [{ from, to, status }] or { "/old": "/new" }.
 * @param {string} text
 * @param {{ file?: string, base?: string | null }} [opts]
 */
export function parseJsonMap(text, opts = {}) {
  const file = opts.file ?? 'input';
  const src = text.replace(/^﻿/, '');
  let data;
  try {
    data = JSON.parse(src);
  } catch (/** @type {any} */ err) {
    let line = 1;
    let col = 1;
    const lc = /line (\d+) column (\d+)/.exec(err.message);
    const pos = /position (\d+)/.exec(err.message);
    if (lc) {
      line = Number(lc[1]);
      col = Number(lc[2]);
    } else if (pos) {
      ({ line, col } = lineCol(src, Number(pos[1])));
    } else {
      ({ line, col } = lineCol(src, src.length));
    }
    const reason = err.message.replace(/\s*\(line \d+ column \d+\)/, '').replace(/ in JSON at position \d+.*/, '');
    throw new InputError(`cannot parse ${file}`, {
      frame: `${file}:${line}:${col}  ${reason}\n${codeFrame(src, line, col)}`,
      hint: 'Check for a missing comma, quote or bracket.',
    });
  }
  /** @type {{ from: unknown, to?: unknown, status?: unknown }[]} */
  let rows;
  if (Array.isArray(data)) {
    rows = data.map((item, i) => {
      if (typeof item === 'string') return { from: item };
      if (!item || typeof item !== 'object') throw new InputError(`${file}: item ${i + 1} must be an object with "from"`);
      return item;
    });
  } else if (data && typeof data === 'object') {
    rows = Object.entries(data).map(([from, to]) => ({ from, to }));
  } else {
    throw new InputError(`${file}: expected an array of { "from", "to" } objects or an object map`);
  }
  return rows.map((row, i) => rowToEntry(row, { base: opts.base, source: `${file}#${i + 1}` }));
}
