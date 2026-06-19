// core/args.mjs
//
// What: Tiny pure argument helpers shared by the command modules.
// How:  Pure string functions. No I/O, no env.
// Deps: none.

/**
 * Strip ONE layer of matching surrounding quotes (single or double) from a string.
 * `"a b"` -> `a b`, `'x'` -> `x`, unquoted/half-quoted returned unchanged.
 * stripQuotes(s) -> string
 */
export function stripQuotes(s) {
  if (s.length >= 2) {
    const a = s[0];
    const b = s[s.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) return s.slice(1, -1);
  }
  return s;
}
