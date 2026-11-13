const APPEND_ARRAYS = new Set(['include', 'exclude']);
const MERGE_OBJECTS = new Set(['headers', 'hostRewrite', 'rules']);

/**
 * Merge option layers: defaults < config file < CLI flags.
 * Repeatable list flags (include/exclude) are appended, object options
 * (headers, hostRewrite, rules) are merged key by key, everything else
 * (including reporters) is replaced.
 * @param {...Record<string, any> | null | undefined} layers
 */
export function mergeOptions(...layers) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (v === undefined) continue;
      if (APPEND_ARRAYS.has(k) && Array.isArray(out[k]) && Array.isArray(v)) out[k] = [...out[k], ...v];
      else if (MERGE_OBJECTS.has(k) && out[k] && typeof out[k] === 'object' && v && typeof v === 'object') out[k] = { ...out[k], ...v };
      else out[k] = Array.isArray(v) ? [...v] : v && typeof v === 'object' ? { ...v } : v;
    }
  }
  return out;
}
