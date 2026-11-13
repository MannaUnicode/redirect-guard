import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseJsonMap } from '../src/input/json.js';
import { parseTextList } from '../src/input/text.js';
import { loadMap, detectFormat } from '../src/input/load-map.js';

const fx = (name) => new URL(`./fixtures/maps/${name}`, import.meta.url);
const BASE = 'https://www.example.com';

test('JSON array map with status forms', async () => {
  const entries = parseJsonMap(await readFile(fx('map.json'), 'utf8'), { file: 'map.json', base: BASE });
  assert.equal(entries.length, 3);
  assert.equal(entries[0].expected.mode, 'redirect');
  assert.deepEqual(entries[1].expected, { to: null, status: [410], mode: 'gone' });
  assert.equal(entries[2].from, 'https://old.example.com/x');
  assert.deepEqual(entries[2].expected.status, [301, 308]);
  assert.equal(entries[1].source, 'map.json#2');
});

test('JSON object map', async () => {
  const entries = parseJsonMap(await readFile(fx('object-map.json'), 'utf8'), { base: BASE });
  assert.deepEqual(
    entries.map((e) => [e.from, e.expected.to]),
    [
      ['https://www.example.com/old-1', 'https://www.example.com/new-1'],
      ['https://www.example.com/old-2', 'https://www.example.com/new-2'],
    ],
  );
});

test('JSON syntax errors carry line, column and a frame', async () => {
  const text = await readFile(fx('broken.json'), 'utf8');
  assert.throws(
    () => parseJsonMap(text, { file: 'broken.json', base: BASE }),
    (err) => {
      assert.equal(err.message, 'cannot parse broken.json');
      assert.match(err.frame, /^broken\.json:3:3 /);
      assert.match(err.frame, /3 \| {3}\{ "from": "\/c"/);
      return true;
    },
  );
});

test('JSON with a wrong top-level type', () => {
  assert.throws(() => parseJsonMap('42'), /expected an array/);
  assert.throws(() => parseJsonMap('[1]'), /must be an object/);
});

test('text list: one URL per line, comments skipped, mode any', async () => {
  const entries = parseTextList(await readFile(fx('urls.txt'), 'utf8'), { file: 'urls.txt', base: BASE });
  assert.deepEqual(
    entries.map((e) => [e.from, e.source, e.expected.mode]),
    [
      ['https://www.example.com/one', 'urls.txt:2', 'any'],
      ['https://www.example.com/two', 'urls.txt:3', 'any'],
      ['https://www.example.com/three?x=1', 'urls.txt:5', 'any'],
    ],
  );
});

test('format detection by extension and by content', () => {
  assert.equal(detectFormat('a.csv'), 'csv');
  assert.equal(detectFormat('a.TSV'), 'tsv');
  assert.equal(detectFormat('a.json'), 'json');
  assert.equal(detectFormat('a.txt'), 'text');
  assert.equal(detectFormat('a.xml.gz'), 'sitemap');
  assert.equal(detectFormat(undefined, ' [ {"from":"/a"} ]'), 'json');
  assert.equal(detectFormat(undefined, '{"a":"b"}'), 'json');
  assert.equal(detectFormat(undefined, '<?xml version="1.0"?><urlset/>'), 'sitemap');
  assert.equal(detectFormat(undefined, '/a,/b'), 'csv');
});

test('loadMap from text with an explicit format', async () => {
  const entries = await loadMap({ text: '{"/a":"/b"}', format: 'json' }, { base: BASE });
  assert.equal(entries[0].id, 1);
  assert.equal(entries[0].source, 'stdin#1');
});
