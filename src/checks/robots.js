import { fixPercentEncoding } from '../url/normalize.js';

/**
 * @typedef {{ allow: boolean, path: string, re: RegExp, len: number }} RobotsRule
 * @typedef {{ agents: string[], rules: RobotsRule[] }} RobotsGroup
 * @typedef {{ groups: RobotsGroup[], sitemaps: string[] }} RobotsRules
 */

/** Percent-encode non-ASCII characters and normalize escapes (RFC 9309 §2.2.2). */
function encodePath(p) {
  return fixPercentEncoding(p.replace(/[^\x21-\x7E]/gu, (c) => encodeURIComponent(c)));
}

/** @param {string} pattern */
function compile(pattern) {
  const norm = encodePath(pattern);
  const anchored = norm.endsWith('$');
  const body = anchored ? norm.slice(0, -1) : norm;
  const re = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return { re: new RegExp(`^${re}${anchored ? '$' : ''}`), len: norm.length };
}

/**
 * Parse robots.txt following RFC 9309: groups of user-agent lines followed by
 * allow/disallow rules. Unknown lines are ignored.
 * @param {string} text
 * @returns {RobotsRules}
 */
export function parseRobots(text) {
  /** @type {RobotsGroup[]} */
  const groups = [];
  /** @type {string[]} */
  const sitemaps = [];
  /** @type {RobotsGroup | null} */
  let current = null;
  let lastWasAgent = false;
  for (const rawLine of String(text ?? '').replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent' || key === 'useragent' || key === 'user agent') {
      const token = value.split(/[\s/]/)[0].toLowerCase();
      if (!token) continue;
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(token);
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false;
      if (!current || value === '') continue;
      const { re, len } = compile(value);
      current.rules.push({ allow: key === 'allow', path: value, re, len });
    } else if (key === 'sitemap') {
      if (value) sitemaps.push(value);
    }
  }
  return { groups, sitemaps };
}

/**
 * Rules that apply to `agent`: every group naming the agent's product token
 * (merged), otherwise every "*" group (merged).
 * @param {RobotsRules} robots
 * @param {string} agent
 */
export function rulesFor(robots, agent = '*') {
  const token = String(agent).split(/[\s/]/)[0].toLowerCase();
  let groups = robots.groups.filter((g) => g.agents.includes(token));
  if (groups.length === 0) groups = robots.groups.filter((g) => g.agents.includes('*'));
  return groups.flatMap((g) => g.rules);
}

/**
 * Longest-match evaluation, Allow wins ties, "*" wildcard and "$" anchor.
 * @param {RobotsRules} robots
 * @param {string} url absolute URL or path (+ query)
 * @param {string} [agent]
 */
export function isAllowed(robots, url, agent = '*') {
  let target;
  try {
    const u = new URL(url);
    target = u.pathname + u.search;
  } catch {
    target = String(url);
  }
  if (target === '/robots.txt') return true;
  target = encodePath(target || '/');
  /** @type {RobotsRule | null} */
  let best = null;
  for (const rule of rulesFor(robots, agent)) {
    if (!rule.re.test(target)) continue;
    if (!best || rule.len > best.len || (rule.len === best.len && rule.allow && !best.allow)) best = rule;
  }
  return best ? best.allow : true;
}
