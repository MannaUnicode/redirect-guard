import { InputError } from '../errors.js';
import { isAbsoluteUrl } from '../url/normalize.js';

/**
 * Parse a status cell: a number, "permanent", "temporary", or several numbers
 * separated by "|" or spaces.
 * @param {unknown} value
 * @param {string} where
 * @returns {number[] | null}
 */
export function parseStatus(value, where) {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) return value.flatMap((v) => /** @type {number[]} */ (parseStatus(v, where)));
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 100 && value <= 599) return [value];
    throw new InputError(`${where}: invalid status ${value}`);
  }
  const s = String(value).trim().toLowerCase();
  if (s === '') return null;
  if (s === 'permanent') return [301, 308];
  if (s === 'temporary') return [302, 307];
  const parts = s.split(/[|\s/]+/).filter(Boolean);
  if (parts.length && parts.every((p) => /^[1-5]\d\d$/.test(p))) return parts.map(Number);
  throw new InputError(`${where}: invalid status "${value}" (use a number such as 301, or "permanent" / "temporary")`);
}

/**
 * @param {string} value
 * @param {string | null | undefined} base
 * @param {string} where
 */
export function resolveUrl(value, base, where) {
  const v = value.trim();
  if (isAbsoluteUrl(v)) {
    try {
      return new URL(v).href;
    } catch {
      throw new InputError(`${where}: invalid URL "${v}"`);
    }
  }
  if (!base) {
    throw new InputError(`${where}: relative URL "${v}" needs --base (the new site origin)`, {
      hint: 'Pass --base https://www.example.com, or use absolute URLs in the map.',
    });
  }
  try {
    return new URL(v.startsWith('/') ? v : `/${v}`, base).href;
  } catch {
    throw new InputError(`${where}: invalid URL "${v}"`);
  }
}

/**
 * Build an entry (without id) from a map row.
 * @param {{ from: unknown, to?: unknown, status?: unknown }} row
 * @param {{ base?: string | null, source: string }} ctx
 * @returns {Omit<import('../checks/evaluate.js').Entry, 'id'>}
 */
export function rowToEntry(row, ctx) {
  const where = ctx.source;
  const fromRaw = row.from == null ? '' : String(row.from).trim();
  if (!fromRaw) throw new InputError(`${where}: missing "from" URL`);
  const from = resolveUrl(fromRaw, ctx.base, where);
  const toRaw = row.to == null ? '' : String(row.to).trim();
  const status = parseStatus(row.status, where);
  if (toRaw) {
    if (status && !status.every((s) => s >= 300 && s < 400)) {
      throw new InputError(`${where}: status ${status.join('|')} cannot have a "to" URL (leave "to" empty for removed or kept pages)`);
    }
    return { source: where, from, expected: { to: resolveUrl(toRaw, ctx.base, where), status, mode: 'redirect' } };
  }
  if (!status) return { source: where, from, expected: { to: null, status: null, mode: 'any' } };
  if (status.every((s) => s >= 200 && s < 300)) return { source: where, from, expected: { to: null, status, mode: 'present' } };
  if (status.every((s) => s >= 400 && s < 500)) return { source: where, from, expected: { to: null, status, mode: 'gone' } };
  throw new InputError(`${where}: status ${status.join('|')} needs a "to" URL`);
}
