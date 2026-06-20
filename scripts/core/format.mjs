// core/format.mjs
//
// What: Pure size/age formatters shared by `list` and `import` so a command module
//       never has to import from a sibling command. Mirrors the original PowerShell
//       Fmt-Size and the relative-age display exactly.
// How:  Pure functions over numbers. No I/O, no env.
// Deps: none.

export const BYTES_PER_KIB = 1024;
export const BYTES_PER_MIB = 1024 * 1024;

/**
 * Binary size like the PowerShell Fmt-Size: >= 1 MiB -> 'N.NMB' else 'N.NKB',
 * with one optional decimal ('0.#' style: a trailing '.0' is dropped).
 * fmtSize(bytes) -> string
 */
export function fmtSize(bytes) {
  if (bytes >= BYTES_PER_MIB) return `${trim1(bytes / BYTES_PER_MIB)}MB`;
  return `${trim1(bytes / BYTES_PER_KIB)}KB`;
}

/**
 * Relative age from a mtime, like the PowerShell: Nd/Nh/Nm ago.
 * fmtAge(mtimeMs, nowMs) -> string
 */
export function fmtAge(mtimeMs, nowMs) {
  const diffMs = Math.max(0, nowMs - mtimeMs);
  const totalMin = diffMs / 60000;
  const totalHr = totalMin / 60;
  const totalDay = totalHr / 24;
  if (totalDay >= 1) return `${Math.floor(totalDay)}d ago`;
  if (totalHr >= 1) return `${Math.floor(totalHr)}h ago`;
  return `${Math.floor(totalMin)}m ago`;
}

// One optional decimal, '0.#' style: drop a trailing '.0'.
function trim1(n) {
  const s = n.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}
