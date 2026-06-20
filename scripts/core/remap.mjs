// core/remap.mjs
//
// What: "Clean the obvious paths" home-prefix remap for cross-OS transfer.
//       On export we tokenize the source home -> ${CSP_HOME}; on import we
//       detokenize ${CSP_HOME} -> the destination machine's home.
// How:  Pure string ops. No deep path rewriting - only the literal home prefix in
//       both native and forward-slash form, case-insensitive for Windows drive paths.
// Deps: none (pure).
//
// Rationale (from spec): the project folder is re-derived from cwd on import, so
// resume works regardless. Tokenizing is cosmetic polish for scrolled-back history.

/** The placeholder written into exported transcripts/manifests in place of $HOME. */
export const HOME_TOKEN = '${CSP_HOME}';

// Escape a string for safe literal use inside a RegExp.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build the list of literal home spellings we should catch.
// Includes the native form and a forward-slash normalized form (Windows backslash
// paths also appear slash-flipped inside JSON), de-duplicated.
function homeVariants(home) {
  const h = String(home);
  const variants = new Set([h, h.replace(/\\/g, '/')]);
  return [...variants].filter(Boolean);
}

/**
 * tokenizeHome(text, home) -> string
 * Replace every literal occurrence of the source home with ${CSP_HOME}.
 * Case-insensitive (covers Windows drive-letter / case differences). We sort
 * variants longest-first so the most specific spelling wins.
 */
export function tokenizeHome(text, home) {
  let out = String(text);
  const variants = homeVariants(home).sort((a, b) => b.length - a.length);
  for (const v of variants) {
    const re = new RegExp(escapeRegExp(v), 'gi');
    out = out.replace(re, HOME_TOKEN);
  }
  return out;
}

/**
 * detokenizeHome(text, home) -> string
 * Replace every ${CSP_HOME} with the CURRENT machine's home in its native form.
 * (We do a plain global string replace - the token is a fixed literal.)
 */
export function detokenizeHome(text, home) {
  const token = HOME_TOKEN;
  const replacement = String(home);
  // Split/join avoids regex-escaping the replacement (which may contain '$').
  return String(text).split(token).join(replacement);
}
