// core/sessions.mjs
//
// What: Discover session .jsonl files in a project folder and resolve a UUID/prefix
//       to exactly one session (the safety gate shared by export/import/delete/list).
// How:  Pure over an injected `fs` facade so tests can feed a fake directory. The
//       caller (commands/*) passes node:fs. We only read directory entries + stat.
// Deps: an `fs` object exposing readdirSync, existsSync, statSync (node:fs is fine);
//       a `pathlib` (path.win32 / path.posix) so joins use the simulated OS.
//
// A "session" is a <uuid>.jsonl file. Its optional sidecar is a sibling dir named
// exactly <uuid> (no extension). We NEVER treat a `memory` folder as a session.

/**
 * listSessions(baseDir, { fs, pathlib }) -> [{ uuid, file, sidecarDir, hasSidecar, bytes, mtimeMs }]
 * Newest first (descending mtime). Returns [] if baseDir is missing.
 * `memory` is never a session (it has no .jsonl form, but we also guard sidecars).
 */
export function listSessions(baseDir, { fs, pathlib }) {
  if (!fs.existsSync(baseDir)) return [];
  const entries = fs.readdirSync(baseDir);
  const out = [];
  for (const name of entries) {
    if (!name.endsWith('.jsonl')) continue;
    const uuid = name.slice(0, -'.jsonl'.length);
    if (!uuid || uuid === 'memory') continue;
    const file = pathlib.join(baseDir, name);
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const sidecarDir = pathlib.join(baseDir, uuid);
    let hasSidecar = false;
    try {
      hasSidecar = fs.existsSync(sidecarDir) && fs.statSync(sidecarDir).isDirectory();
    } catch {
      hasSidecar = false;
    }
    out.push({
      uuid,
      file,
      sidecarDir,
      hasSidecar,
      bytes: st.size,
      mtimeMs: st.mtimeMs,
    });
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

/**
 * resolveOne(baseDir, uuidOrPrefix, { fs, pathlib })
 *   -> { status: 'none' } | { status: 'one', session } | { status: 'many', matches: [uuid,...] }
 *
 * Matches sessions whose uuid STARTS WITH the given prefix (mirrors the PowerShell
 * `-like "$uuid*"`). A full uuid is just a prefix that matches one. Never matches
 * `memory`. `matches` (the 'many' case) lists uuids for the caller to print.
 */
export function resolveOne(baseDir, uuidOrPrefix, { fs, pathlib }) {
  const prefix = String(uuidOrPrefix ?? '').trim();
  // An empty prefix must NOT match every session (startsWith('') is always true) - that
  // would let a dropped argument silently target the lone session. Treat it as no match.
  if (prefix === '') return { status: 'none' };
  const all = listSessions(baseDir, { fs, pathlib });
  const matches = all.filter((s) => s.uuid.startsWith(prefix));
  if (matches.length === 0) return { status: 'none' };
  if (matches.length > 1) return { status: 'many', matches: matches.map((m) => m.uuid) };
  return { status: 'one', session: matches[0] };
}
