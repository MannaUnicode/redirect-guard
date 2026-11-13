/**
 * Host rewrite: requests for origin A go to origin B, and Locations on B are
 * mapped back to A so the logical chain stays in production space.
 * @param {Record<string, string>} [map]
 */
export function createRewriter(map = {}) {
  const pairs = Object.entries(map || {}).map(([a, b]) => [new URL(a).origin, new URL(b).origin]);
  return {
    active: pairs.length > 0,
    /** Origins requests are actually sent to. */
    targets: pairs.map(([, b]) => b),
    /** @param {string} url */
    toRequest(url) {
      const u = new URL(url);
      for (const [a, b] of pairs) {
        if (u.origin === a) return b + u.pathname + u.search + u.hash;
      }
      return u.href;
    },
    /** @param {string} url */
    toLogical(url) {
      const u = new URL(url);
      for (const [a, b] of pairs) {
        if (u.origin === b) return a + u.pathname + u.search + u.hash;
      }
      return u.href;
    },
  };
}
