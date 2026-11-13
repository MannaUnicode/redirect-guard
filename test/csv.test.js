import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseCsv, parseCsvMap, detectDelimiter } from '../src/input/csv.js';
import { loadMap } from '../src/input/load-map.js';
import { InputError } from '../src/errors.js';

const fx = (name) => new URL(`./fixtures/maps/${name}`, import.meta.url);
const BASE = 'https://www.example.com';

test('basic CSV with header, comments and gone rows', async () => {
  const entries = parseCsvMap(await readFile(fx('basic.csv'), 'utf8'), { file: 'basic.csv', base: BASE });
  assert.equal(entries.length, 3);
  assert.deepEqual(entries[0], {
    source: 'basic.csv:2',
    from: 'https://www.example.com/chi-siamo',
    expected: { to: 'https://www.example.com/about', status: null, mode: 'redirect' },
  });
  assert.deepEqual(entries[1].expected.status, [301]);
  assert.equal(entries[2].source, 'basic.csv:5');
  assert.deepEqual(entries[2].expected, { to: null, status: [410], mode: 'gone' });
});

test('semicolon delimiter, alias headers and status aliases', async () => {
  const text = await readFile(fx('semicolon.csv'), 'utf8');
  assert.equal(detectDelimiter(text), ';');
  const entries = parseCsvMap(text, { base: BASE });
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0].expected.status, [301]);
  assert.deepEqual(entries[1].expected.status, [301, 308]);
});

test('quoted fields, escaped quotes and reordered header columns', async () => {
  const entries = parseCsvMap(await readFile(fx('quoted.csv'), 'utf8'), { base: BASE });
  assert.equal(entries[0].from, 'https://www.example.com/old%20%22quoted%22');
  assert.equal(entries[0].expected.to, 'https://www.example.com/new,with-comma');
  assert.equal(entries[1].from, 'https://www.example.com/plain-old');
});

test('UTF-8 BOM, CRLF and blank lines', async () => {
  const entries = parseCsvMap(await readFile(fx('bom.csv'), 'utf8'), { file: 'bom.csv', base: BASE });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].from, 'https://www.example.com/bom-a');
  assert.equal(entries[1].source, 'bom.csv:4');
});

test('headerless TSV', async () => {
  const text = await readFile(fx('headerless.tsv'), 'utf8');
  assert.equal(detectDelimiter(text), '\t');
  const entries = parseCsvMap(text, { base: BASE });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].from, 'https://www.example.com/t-a');
  assert.deepEqual(entries[1].expected.status, [308]);
});

test('unterminated quote reports file:line:column with a code frame', async () => {
  const text = await readFile(fx('unterminated.csv'), 'utf8');
  assert.throws(
    () => parseCsvMap(text, { file: 'redirects.csv', base: BASE }),
    (err) => {
      assert.ok(err instanceof InputError);
      assert.equal(err.code, 'ERR_INPUT');
      assert.match(err.frame, /^redirects\.csv:3:10 {2}unterminated quoted field/);
      assert.match(err.frame, /3 \| \/negozio,"\/shop\/new,301/);
      assert.match(err.frame, / {10}\^$/m);
      return true;
    },
  );
});

test('relative URLs without base are an input error', () => {
  assert.throws(() => parseCsvMap('/a,/b\n'), /needs --base/);
});

test('absolute URLs need no base', () => {
  const [e] = parseCsvMap('http://old.example.com/a,https://new.example.com/b\n');
  assert.equal(e.from, 'http://old.example.com/a');
  assert.equal(e.expected.to, 'https://new.example.com/b');
});

test('status semantics: 200 means kept, 3xx needs a target, invalid status fails', () => {
  assert.equal(parseCsvMap('/kept,,200\n', { base: BASE })[0].expected.mode, 'present');
  assert.equal(parseCsvMap('/any\n', { base: BASE })[0].expected.mode, 'any');
  assert.throws(() => parseCsvMap('/x,,301\n', { base: BASE }), /needs a "to" URL/);
  assert.throws(() => parseCsvMap('/x,/y,410\n', { base: BASE }), /cannot have a "to"/);
  assert.throws(() => parseCsvMap('/x,/y,abc\n', { base: BASE }), /invalid status/);
  assert.deepEqual(parseCsvMap('/x,/y,temporary\n', { base: BASE })[0].expected.status, [302, 307]);
});

test('parseCsv keeps empty cells and handles a trailing newline-less row', () => {
  assert.deepEqual(parseCsv('a,,c\nd,e', {}), [
    { cells: ['a', '', 'c'], line: 1 },
    { cells: ['d', 'e'], line: 2 },
  ]);
});

test('loadMap reads files by extension and assigns ids', async () => {
  const entries = await loadMap(fileURLToPath(fx('basic.csv')), { base: BASE });
  assert.deepEqual(
    entries.map((e) => e.id),
    [1, 2, 3],
  );
});

test('loadMap reports a missing file', async () => {
  await assert.rejects(loadMap('does-not-exist.csv', { base: BASE }), /file not found/);
});
