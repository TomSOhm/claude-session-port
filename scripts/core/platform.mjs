// core/platform.mjs
//
// What: Pure helpers for locating Claude Code's on-disk session store.
// How:  Every function takes the OS / home directory as a PARAMETER. Nothing here
//       reads process.platform or os.homedir() - that keeps the module pure so the
//       unit tests can simulate Windows on Linux (and vice-versa) on any CI runner.
// Deps: node:path (the posix/win32 sub-namespaces only - never the ambient one).
//
// The single source of truth for "where do sessions live":
//   <home>/.claude/projects/<encodeCwd(cwd)>/<uuid>.jsonl  (+ optional <uuid>/ sidecar).

import path from 'node:path';

/**
 * Normalize an arbitrary platform string to one of our canonical OS ids.
 * Accepts the values process.platform yields ('win32','darwin','linux',...).
 * detectOS(platform) -> 'win32' | 'darwin' | 'linux'
 * Unknown unix-likes collapse to 'linux' (the POSIX-trash fallback path).
 */
export function detectOS(platform) {
  if (platform === 'win32') return 'win32';
  if (platform === 'darwin') return 'darwin';
  return 'linux';
}

/**
 * Pick the right node:path flavour for an OS so path math is deterministic
 * regardless of the runner. pathFor(os) -> path.win32 | path.posix
 */
export function pathFor(os) {
  return detectOS(os) === 'win32' ? path.win32 : path.posix;
}

/**
 * The Claude root: <home>/.claude
 * claudeRoot(home, os) -> string
 */
export function claudeRoot(home, os) {
  return pathFor(os).join(home, '.claude');
}

/**
 * Base dir that holds the per-project session folders.
 * projectsBase(home, os) -> <home>/.claude/projects
 */
export function projectsBase(home, os) {
  return pathFor(os).join(claudeRoot(home, os), 'projects');
}

/**
 * Quarantine root used when no native trash exists.
 * trashRoot(home, os) -> <home>/.claude/.trash-sessions
 */
export function trashRoot(home, os) {
  return pathFor(os).join(claudeRoot(home, os), '.trash-sessions');
}

/**
 * The session folder for a project, given an ALREADY-encoded cwd name. Apply
 * encodeCwd() (core/encode.mjs) at the call site, then pass its result here.
 * projectDir(home, os, encodedCwd) -> <home>/.claude/projects/<encodedCwd>
 */
export function projectDir(home, os, encodedCwd) {
  return pathFor(os).join(projectsBase(home, os), encodedCwd);
}
