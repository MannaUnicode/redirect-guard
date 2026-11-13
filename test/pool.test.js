import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter, createPool } from '../src/http/pool.js';

test('limiter never exceeds its concurrency and runs FIFO', async () => {
  const limiter = createLimiter(2);
  let active = 0;
  let peak = 0;
  const order = [];
  await Promise.all(
    [1, 2, 3, 4, 5].map((n) =>
      limiter.run(async () => {
        active++;
        peak = Math.max(peak, active);
        order.push(n);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      }),
    ),
  );
  assert.equal(peak, 2);
  assert.deepEqual(order, [1, 2, 3, 4, 5]);
});

test('limiter propagates errors and keeps going', async () => {
  const limiter = createLimiter(1);
  const a = limiter.run(async () => {
    throw new Error('boom');
  });
  const b = limiter.run(async () => 'ok');
  await assert.rejects(a, /boom/);
  assert.equal(await b, 'ok');
});

test('pool enforces a per-origin delay', async () => {
  let clock = 0;
  const waits = [];
  const pool = createPool({
    concurrency: 4,
    delay: 100,
    now: () => clock,
    sleep: async (ms) => {
      waits.push(ms);
    },
  });
  await Promise.all([pool.run('a', async () => 1), pool.run('a', async () => 2), pool.run('b', async () => 3), pool.run('a', async () => 4)]);
  assert.deepEqual(waits, [100, 200], 'origin a waits 100 and 200 ms, origin b does not wait');
});
