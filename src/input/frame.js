/**
 * A small code frame pointing at line/column (1-based) of `text`.
 * @param {string} text
 * @param {number} line
 * @param {number} col
 */
export function codeFrame(text, line, col) {
  const lines = text.split(/\r\n|\r|\n/);
  const src = lines[line - 1] ?? '';
  const num = String(line);
  const gutter = ' '.repeat(num.length);
  const shown = src.length > 120 ? `${src.slice(0, 117)}...` : src;
  const caretCol = Math.max(1, Math.min(col, shown.length + 1));
  return `   ${num} | ${shown}\n   ${gutter} | ${' '.repeat(caretCol - 1)}^`;
}

/**
 * Line and column (1-based) of a character offset.
 * @param {string} text
 * @param {number} offset
 */
export function lineCol(text, offset) {
  let line = 1;
  let last = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      last = i + 1;
    }
  }
  return { line, col: offset - last + 1 };
}
