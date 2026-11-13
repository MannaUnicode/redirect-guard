import { InputError } from '../errors.js';
import { codeFrame } from './frame.js';
import { rowToEntry } from './entry.js';

const FROM = ['from', 'source', 'old', 'old_url', 'url'];
const TO = ['to', 'target', 'new', 'new_url', 'destination'];
const STATUS = ['status', 'code', 'type'];

/**
 * Detect the delimiter from the first non-comment line: tab > ; > ,
 * @param {string} text
 */
export function detectDelimiter(text) {
  for (const line of text.split(/\r\n|\r|\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const outside = line.replace(/"(?:[^"]|"")*"/g, '');
    if (outside.includes('\t')) return '\t';
    if (outside.includes(';')) return ';';
    return ',';
  }
  return ',';
}

/**
 * RFC 4180 subset: quotes, escaped "", CRLF/LF, BOM, blank lines, # comments.
 * @param {string} input
 * @param {{ file?: string, delimiter?: string }} [opts]
 * @returns {{ cells: string[], line: number }[]}
 */
export function parseCsv(input, opts = {}) {
  const file = opts.file ?? 'input';
  const text = input.replace(/^﻿/, '');
  const delim = opts.delimiter ?? detectDelimiter(text);
  /** @type {{ cells: string[], line: number }[]} */
  const rows = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const n = text.length;
  while (i < n) {
    // start of a record
    const recordLine = line;
    if (text[i] === '#') {
      while (i < n && text[i] !== '\n' && text[i] !== '\r') i++;
      if (text[i] === '\r' && text[i + 1] === '\n') i++;
      i++;
      line++;
      col = 1;
      continue;
    }
    /** @type {string[]} */
    const cells = [];
    let cell = '';
    let atRecordEnd = false;
    while (i < n && !atRecordEnd) {
      const c = text[i];
      if (c === '"' && cell === '') {
        const qLine = line;
        const qCol = col;
        i++;
        col++;
        let closed = false;
        while (i < n) {
          const d = text[i];
          if (d === '"') {
            if (text[i + 1] === '"') {
              cell += '"';
              i += 2;
              col += 2;
              continue;
            }
            i++;
            col++;
            closed = true;
            break;
          }
          if (d === '\n') {
            line++;
            col = 1;
          } else {
            col++;
          }
          cell += d;
          i++;
        }
        if (!closed) {
          throw new InputError(`cannot parse ${file}`, {
            frame: `${file}:${qLine}:${qCol}  unterminated quoted field\n${codeFrame(text, qLine, qCol)}`,
            hint: 'Fix the quote, or remove it if the field has no delimiter.',
          });
        }
        // skip anything until the delimiter or end of line
        while (i < n && text[i] !== delim && text[i] !== '\n' && text[i] !== '\r') {
          cell += text[i];
          i++;
          col++;
        }
        continue;
      }
      if (c === delim) {
        cells.push(cell);
        cell = '';
        i++;
        col++;
        continue;
      }
      if (c === '\r' || c === '\n') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        i++;
        line++;
        col = 1;
        atRecordEnd = true;
        continue;
      }
      cell += c;
      i++;
      col++;
    }
    cells.push(cell);
    if (cells.length === 1 && cells[0].trim() === '') continue;
    rows.push({ cells: cells.map((s) => s.trim()), line: recordLine });
  }
  return rows;
}

/** @param {string} s */
const isUrlLike = (s) => /^(https?:\/\/|\/)/i.test(s.trim());

/**
 * Parse a CSV/TSV redirect map into entries (without ids).
 * @param {string} text
 * @param {{ file?: string, base?: string | null }} [opts]
 */
export function parseCsvMap(text, opts = {}) {
  const file = opts.file ?? 'input';
  const rows = parseCsv(text, { file });
  if (rows.length === 0) return [];
  let fromIdx = 0;
  let toIdx = 1;
  let statusIdx = 2;
  let start = 0;
  const head = rows[0].cells.map((c) => c.toLowerCase());
  if (!isUrlLike(head[0] ?? '') && head.some((h) => FROM.includes(h))) {
    fromIdx = head.findIndex((h) => FROM.includes(h));
    toIdx = head.findIndex((h) => TO.includes(h));
    statusIdx = head.findIndex((h) => STATUS.includes(h));
    start = 1;
  }
  return rows.slice(start).map((row) =>
    rowToEntry(
      {
        from: row.cells[fromIdx],
        to: toIdx >= 0 ? row.cells[toIdx] : '',
        status: statusIdx >= 0 ? row.cells[statusIdx] : '',
      },
      { base: opts.base, source: `${file}:${row.line}` },
    ),
  );
}
