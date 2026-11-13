import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** Package version, read from package.json. */
export const version = /** @type {string} */ (pkg.version);
