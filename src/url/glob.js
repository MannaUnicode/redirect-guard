/**
 * Tiny glob to RegExp: `**` matches anything (including "/"), `*` matches
 * anything except "/", `?` matches one character except "/".
 * A trailing "/**" also matches the directory itself ("/blog/**" matches "/blog").
 * @param {string} glob
 */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (re.endsWith('\\/') && i === glob.length - 1) {
          re = `${re.slice(0, -2)}(?:\\/.*)?`;
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\/]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

/**
 * @param {string[]} globs
 * @returns {(target: string) => boolean}
 */
export function createMatcher(globs) {
  const res = globs.map(globToRegExp);
  return (target) => res.some((r) => r.test(target));
}
