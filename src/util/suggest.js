/**
 * Levenshtein distance (small strings only).
 * @param {string} a
 * @param {string} b
 */
export function distance(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Closest candidate within distance 2, or null.
 * @param {string} word
 * @param {readonly string[]} candidates
 */
export function closest(word, candidates) {
  let best = null;
  let bestD = 3;
  for (const c of candidates) {
    const d = distance(word, c);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}
