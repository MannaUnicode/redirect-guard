import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { withRetry, parseRetryAfter, isRetryableError, sleep } from '../src/http/retry.js';

const res = (status, headers = {}) => ({ status, headers: new Headers(headers) });

test('parseRetryAfter: seconds and HTTP date', () => {
  assert.equal(parseRetryAfter('3'), 3000);
  const now = Date.parse('2026-11-13T10:00:00Z');
  assert.equal(parseRetryAfter('Fri, 13 Nov 2026 10:00:05 GMT', now), 5000);
  assert.equal(parseRetryAfter('Fri, 13 Nov 2026 09:00:00 GMT', now), 0);
  assert.equal(parseRetryAfter('soon'), null);
  assert.equal(parseRetryAfter(null), null);
});

test('retries 429/503, honours Retry-After capped at 60 s', async () => {
  const waits = [];
  const answers = [res(429, { 'retry-after': '2' }), res(503, { 'retry-after': '120' }), res(200)];
  const { result, attempts } = await withRetry(async () => answers.shift(), {
    retries: 2,
    sleep: async (ms) => waits.push(ms),
  });
  assert.equal(result.status, 200);
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [2000, 60000]);
});

test('exponential backoff with jitter when there is no Retry-After', async () => {
  const waits = [];
  const answers = [res(503), res(503), res(503)];
  const { result, attempts } = await withRetry(async () => answers.shift(), {
    retries: 2,
    sleep: async (ms) => waits.push(ms),
    random: () => 0.5,
  });
  assert.equal(result.status, 503, 'the last response is returned after the retries');
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [625, 1125]);
});

test('non-retryable statuses and errors are not retried', async () => {
  let calls = 0;
  const r = await withRetry(async () => {
    calls++;
    return res(404);
  });
  assert.equal(r.attempts, 1);
  assert.equal(calls, 1);
  await assert.rejects(
    withRetry(async () => {
      throw Object.assign(new Error('nope'), { code: 'ENOTFOUND' });
    }),
    (err) => err.attempts === 1,
  );
  assert.equal(isRetryableError({ code: 'UND_ERR_SOCKET' }), true);
  assert.equal(isRetryableError({ code: 'ECONNREFUSED' }), false);
  assert.equal(isRetryableError({ code: 'ECONNRESET', aborted: true }), false);
});

test('Retry-After is honoured with mock timers', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const answers = [res(429, { 'retry-after': '5' }), res(200)];
    let settled = false;
    const p = withRetry(async () => answers.shift(), { retries: 1 }).then((v) => {
      settled = true;
      return v;
    });
    await new Promise((r) => setImmediate(r));
    mock.timers.tick(4999);
    await new Promise((r) => setImmediate(r));
    assert.equal(settled, false, 'still waiting before 5 s');
    mock.timers.tick(1);
    const { result, attempts } = await p;
    assert.equal(result.status, 200);
    assert.equal(attempts, 2);
  } finally {
    mock.timers.reset();
  }
});

test('sleep is abortable', async () => {
  const ac = new AbortController();
  const p = sleep(10_000, ac.signal);
  ac.abort(new Error('stop'));
  await assert.rejects(p, /stop/);
});
