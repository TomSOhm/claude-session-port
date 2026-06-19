// core/encode.mjs
//
// What: Reproduces Claude Code's project-folder encoding.
// How:  Every character that is NOT [A-Za-z0-9] is replaced by a single '-'.
//       This matches the PowerShell `-replace '[^A-Za-z0-9]','-'` exactly, so a
//       cwd encodes to the same folder Claude Code itself writes.
// Deps: none (pure).
//
// Examples:
//   Windows  C:\Users\you\my-app  -> C--Users-you-my-app   (':' and both '\' each -> '-')
//   POSIX    /Users/you/my-app    -> -Users-you-my-app     (leading '/' -> '-')

/**
 * encodeCwd(absPath) -> string
 * Note: each non-alphanumeric becomes its OWN '-' (no run-collapsing), exactly
 * like the .NET regex replace. So 'C:\\Users' -> 'C--Users' (colon + backslash).
 */
export function encodeCwd(absPath) {
  return String(absPath).replace(/[^A-Za-z0-9]/g, '-');
}
