import { readFile, access } from 'node:fs/promises';
import { dirname, resolve as resolvePath, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConfigError } from '../errors.js';
import { validateConfig } from './validate.js';

export const CONFIG_FILES = ['redirect-guard.config.json', 'redirect-guard.config.mjs'];

/**
 * Expand "$env:NAME" references in a string. Missing variables throw, naming
 * the variable but never printing any value.
 * @param {string} value
 * @param {Record<string, string | undefined>} env
 * @param {string} where
 */
export function expandEnvString(value, env, where) {
  return value.replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/g, (_m, name) => {
    const v = env[name];
    if (v === undefined || v === '') {
      throw new ConfigError(`environment variable ${name} is not set`, { hint: `Referenced by ${where}.` });
    }
    return v;
  });
}

/**
 * Expand $env: in `base`, `headers` values and `hostRewrite` keys/values.
 * @param {Record<string, any>} cfg
 * @param {Record<string, string | undefined>} env
 */
export function expandEnv(cfg, env) {
  const out = { ...cfg };
  if (typeof out.base === 'string') out.base = expandEnvString(out.base, env, 'base');
  if (out.headers && typeof out.headers === 'object') {
    out.headers = Object.fromEntries(
      Object.entries(out.headers).map(([k, v]) => [k, typeof v === 'string' ? expandEnvString(v, env, `headers.${k}`) : v]),
    );
  }
  if (out.hostRewrite && typeof out.hostRewrite === 'object') {
    out.hostRewrite = Object.fromEntries(
      Object.entries(out.hostRewrite).map(([k, v]) => [
        expandEnvString(k, env, 'hostRewrite'),
        typeof v === 'string' ? expandEnvString(v, env, `hostRewrite["${k}"]`) : v,
      ]),
    );
  }
  return out;
}

/** @param {string} p */
async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find and load a config file. Returns null when none is found (and none was requested).
 * @param {{ cwd: string, path?: string | null, env?: Record<string, string | undefined> }} opts
 * @returns {Promise<{ path: string, dir: string, config: Record<string, any> } | null>}
 */
export async function loadConfigFile(opts) {
  let file = null;
  if (opts.path) {
    file = resolvePath(opts.cwd, opts.path);
    if (!(await exists(file))) throw new ConfigError(`config file not found: ${opts.path}`);
  } else {
    for (const name of CONFIG_FILES) {
      const candidate = resolvePath(opts.cwd, name);
      if (await exists(candidate)) {
        file = candidate;
        break;
      }
    }
  }
  if (!file) return null;
  /** @type {any} */
  let config;
  const ext = extname(file).toLowerCase();
  if (ext === '.mjs' || ext === '.js') {
    try {
      const mod = await import(pathToFileURL(file).href);
      config = mod.default;
    } catch (/** @type {any} */ err) {
      throw new ConfigError(`cannot load ${file}: ${err.message}`, { cause: err });
    }
  } else {
    const text = await readFile(file, 'utf8');
    try {
      config = JSON.parse(text.replace(/^﻿/, ''));
    } catch (/** @type {any} */ err) {
      throw new ConfigError(`cannot parse ${file}: ${err.message}`);
    }
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new ConfigError(`${file}: the config must be an object`);
  }
  try {
    validateConfig(config);
  } catch (/** @type {any} */ err) {
    err.message = `${file}: ${err.message}`;
    throw err;
  }
  const dir = dirname(file);
  config = expandEnv(config, opts.env ?? {});
  // map/sitemap paths in a config file are relative to the file
  for (const key of ['map', 'sitemap']) {
    const v = config[key];
    if (typeof v === 'string' && !/^https?:\/\//i.test(v) && v !== '-') config[key] = resolvePath(dir, v);
  }
  return { path: file, dir, config };
}
