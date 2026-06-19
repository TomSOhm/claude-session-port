// commands/list.mjs
//
// What: `list` (and its `--show <uuid|prefix>` mode). Prints one row per session for
//       the current project, newest first, plus the SIZE-bridge note. `--show` prints
//       read-only target info used by the delete wrapper's safety flow.
// How:  Impure orchestration over pure core (sessions, titles, platform, encode).
//       Reads files via the injected ctx.fs; resolves the project dir from ctx.cwd.
// Deps: ctx = { fs, pathlib, home, os, cwd, out }  (built by cli.mjs).
//
// Output columns mirror the PowerShell exactly:
//   {BaseName}  {size,8}  {age,-9} {branch,-30} {flag(5)}  {title}
// where flag is 'AGENT' or 5 spaces, and size is binary MB/KB.

import { encodeCwd } from '../core/encode.mjs';
import { projectDir } from '../core/platform.mjs';
import { listSessions, resolveOne } from '../core/sessions.mjs';
import { firstUserTitle, gitBranch, isAgent } from '../core/titles.mjs';

/** Binary size like the PowerShell Fmt-Size: >=1MiB -> 'N.NMB' else 'N.NKB'. */
export function fmtSize(bytes) {
  if (bytes >= 1048576) return `${trim1(bytes / 1048576)}MB`;
  return `${trim1(bytes / 1024)}KB`;
}

// One optional decimal, '0.#' style: drop a trailing '.0'.
function trim1(n) {
  const s = n.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** Relative age from a mtime, like the PowerShell: Nd/Nh/Nm ago. */
export function fmtAge(mtimeMs, nowMs) {
  const diffMs = Math.max(0, nowMs - mtimeMs);
  const totalMin = diffMs / 60000;
  const totalHr = totalMin / 60;
  const totalDay = totalHr / 24;
  if (totalDay >= 1) return `${Math.floor(totalDay)}d ago`;
  if (totalHr >= 1) return `${Math.floor(totalHr)}h ago`;
  return `${Math.floor(totalMin)}m ago`;
}

// Left/right pad to a fixed width (truncation is NOT done - matches PowerShell -f).
function padRight(s, w) {
  s = String(s);
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}
function padLeft(s, w) {
  s = String(s);
  return s.length >= w ? s : ' '.repeat(w - s.length) + s;
}

// Resolve this project's session base dir from cwd.
function baseDirFor(ctx) {
  return projectDir(ctx.home, ctx.os, encodeCwd(ctx.cwd));
}

/**
 * runList(args, ctx) -> exitCode
 * args: [] for the table, or ['--show', '<uuid|prefix>'] for target info.
 */
export function runList(args, ctx) {
  if (args[0] === '--show') {
    return runShow(args[1], ctx);
  }
  const base = baseDirFor(ctx);
  if (!ctx.fs.existsSync(base)) {
    ctx.out(`No session folder for this project: ${base}`);
    return 0;
  }
  const sessions = listSessions(base, { fs: ctx.fs, pathlib: ctx.pathlib });
  const now = ctx.now ? ctx.now() : Date.now();
  for (const s of sessions) {
    const text = readText(ctx.fs, s.file);
    const flag = isAgent(text) ? 'AGENT' : '     ';
    // PowerShell format: "{0}  {1,8}  {2,-9} {3,-30} {4}  {5}"
    //   uuid + 2sp + size(>=8,right) + 2sp + age(>=9,left) + 1sp +
    //   branch(>=30,left) + 1sp + flag(5) + 2sp + title
    const row =
      s.uuid +
      '  ' +
      padLeft(fmtSize(s.bytes), 8) +
      '  ' +
      padRight(fmtAge(s.mtimeMs, now), 9) +
      ' ' +
      padRight(gitBranch(text), 30) +
      ' ' +
      flag +
      '  ' +
      firstUserTitle(text);
    ctx.out(row);
  }
  ctx.out('');
  ctx.out(
    'match key = SIZE (== /resume). AGENT rows + the current session are hidden from /resume.',
  );
  return 0;
}

/**
 * runShow(uuidOrPrefix, ctx) -> exitCode (0 ok / 2 none / 3 ambiguous)
 * Read-only target info for the delete wrapper's confirm flow.
 */
export function runShow(uuidOrPrefix, ctx) {
  const base = baseDirFor(ctx);
  const r = resolveOne(base, uuidOrPrefix, { fs: ctx.fs, pathlib: ctx.pathlib });
  if (r.status === 'none') {
    ctx.out(`NO MATCH for '${uuidOrPrefix}' in ${base}`);
    return 2;
  }
  if (r.status === 'many') {
    ctx.out(`AMBIGUOUS - ${r.matches.length} matches:`);
    for (const u of r.matches) ctx.out(u);
    return 3;
  }
  const s = r.session;
  const kb = Math.trunc(s.bytes / 1024);
  ctx.out(`TARGET uuid : ${s.uuid}`);
  ctx.out(`file        : ${s.file}  (${kb} KB)`);
  ctx.out(`sidecar dir : ${s.hasSidecar ? s.sidecarDir : '(none)'}`);
  return 0;
}

function readText(fs, file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}
