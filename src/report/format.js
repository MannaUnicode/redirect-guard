import { formatText } from './text.js';
import { formatMarkdown } from './markdown.js';
import { formatJunit } from './junit.js';
import { formatGithub } from './github.js';

export const REPORTERS = Object.freeze(['text', 'json', 'markdown', 'junit', 'github']);

/** @param {any} report */
export function formatJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/**
 * Render a report in one of the supported formats.
 * @param {any} report
 * @param {'text' | 'json' | 'markdown' | 'junit' | 'github'} format
 * @param {{ color?: boolean, unicode?: boolean, verbose?: boolean, quiet?: boolean, columns?: number, failOn?: 'error' | 'warn' }} [opts]
 */
export function formatReport(report, format, opts = {}) {
  switch (format) {
    case 'text':
      return formatText(report, opts);
    case 'json':
      return formatJson(report);
    case 'markdown':
      return formatMarkdown(report);
    case 'junit':
      return formatJunit(report, opts);
    case 'github':
      return formatGithub(report);
    default:
      throw new TypeError(`unknown report format "${format}"`);
  }
}
