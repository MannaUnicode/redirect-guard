import { normalizeUrl, differsOnlyByQuery, differsOnlyByTrailingSlash } from '../url/normalize.js';
import { issue } from './issue.js';

/**
 * Compare the final URL with the expected target.
 * @param {string} finalUrl
 * @param {string} expectedTo
 * @param {{ ignoreTrailingSlash?: boolean, ignoreQuery?: boolean }} opts
 * @param {(u: string) => string} short
 */
export function destinationIssue(finalUrl, expectedTo, opts, short) {
  const cmp = { ignoreTrailingSlash: opts.ignoreTrailingSlash, ignoreQuery: opts.ignoreQuery };
  if (normalizeUrl(finalUrl, cmp) === normalizeUrl(expectedTo, cmp)) return null;
  let note = '';
  /** @type {string | null} */
  let differsBy = null;
  if (differsOnlyByTrailingSlash(finalUrl, expectedTo)) {
    note = ' (differs only by the trailing slash; set ignoreTrailingSlash to accept)';
    differsBy = 'trailing-slash';
  } else if (differsOnlyByQuery(finalUrl, expectedTo)) {
    note = ' (differs only by the query string)';
    differsBy = 'query';
  } else {
    const a = new URL(finalUrl);
    const b = new URL(expectedTo);
    if (a.pathname + a.search === b.pathname + b.search) {
      if (a.host === b.host && a.protocol !== b.protocol) {
        note = ` (${a.protocol.slice(0, -1)} instead of ${b.protocol.slice(0, -1)})`;
        differsBy = 'protocol';
      } else if (a.host !== b.host) {
        note = ` (host ${a.host} instead of ${b.host})`;
        differsBy = 'host';
      }
    }
  }
  return issue('wrong-destination', `Ends at ${short(finalUrl)}, expected ${short(expectedTo)}${note}`, {
    final: finalUrl,
    expected: expectedTo,
    differsBy,
  });
}
