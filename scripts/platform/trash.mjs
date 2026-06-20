// platform/trash.mjs
//
// What: Send a file or directory to the OS native trash, with a quarantine-folder
//       fallback when no native trash tool exists. NEVER silently hard-deletes.
// How:  Impure by design - this is the one place that touches the real OS trash.
//       Per-OS strategy:
//         win32  : powershell -NoProfile -Command + Microsoft.VisualBasic.FileIO
//                  SendToRecycleBin (port of delete_uuid.md TRASH).
//         darwin : osascript -> Finder "delete POSIX file".
//         linux  : gio trash <path>, else trash (trash-cli), else fallback.
//         other  : fallback.
//       Fallback (any OS): move into <home>/.claude/.trash-sessions/<uuid>/ and
//       report that location.
// Deps: node:child_process (spawnSync), node:fs, node:os, node:path, and the pure
//       core/platform.trashRoot for the quarantine location.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectOS, trashRoot } from '../core/platform.mjs';

// Does an executable exist on PATH? (cheap probe via spawnSync with no output.)
function hasCmd(cmd) {
  const res =
    process.platform === 'win32'
      ? spawnSync('where', [cmd], { stdio: 'ignore' })
      : spawnSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' });
  return res.status === 0;
}

// --- per-OS native attempts: return true on success, false to try next/fallback ---

function trashWin32(absPath) {
  // Use VB FileSystem so a single API handles both files and directories and routes to
  // the Recycle Bin. The path is embedded as a single-quoted PowerShell literal (escape
  // ' -> '') rather than passed as a trailing arg: `powershell -Command "<script>" <arg>`
  // does NOT populate $args (verified - trailing tokens are appended to the command, not
  // bound), so the old `$p = $args[0]` form passed an empty path and ALWAYS failed,
  // silently degrading every Windows delete to the quarantine fallback.
  const lit = "'" + String(absPath).replace(/'/g, "''") + "'";
  const ps = [
    'Add-Type -AssemblyName Microsoft.VisualBasic;',
    `$p = ${lit};`,
    'if (Test-Path -LiteralPath $p -PathType Container) {',
    "  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p,'OnlyErrorDialogs','SendToRecycleBin')",
    '} else {',
    "  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p,'OnlyErrorDialogs','SendToRecycleBin')",
    '}',
  ].join(' ');
  const res = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  return !res.error && res.status === 0;
}

function trashDarwin(absPath) {
  // Finder requires a POSIX path; quote-safety handled by passing one -e string with
  // the path embedded - we escape any embedded double quotes.
  const escaped = absPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `tell application "Finder" to delete POSIX file "${escaped}"`;
  const res = spawnSync('osascript', ['-e', script], { encoding: 'utf8' });
  return !res.error && res.status === 0;
}

/**
 * Move a path into the quarantine folder. Returns the new location.
 * quarantine(absPath, { uuid, home, os }) -> destPath
 */
function quarantine(absPath, { uuid, home, platform }) {
  const osId = detectOS(platform);
  const root = trashRoot(home, osId);
  // Group by uuid so a .jsonl and its sidecar land together and can be recovered.
  const bucket = path.join(root, uuid || path.basename(absPath));
  fs.mkdirSync(bucket, { recursive: true });
  const dest = path.join(bucket, path.basename(absPath));
  moveItem(absPath, dest);
  return dest;
}

// Move a file or directory; fall back to copy+remove across devices (renameSync throws
// EXDEV when source and destination are on different volumes).
function moveItem(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      fs.cpSync(src, dest, { recursive: true });
      fs.rmSync(src, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
}

/**
 * sendToTrash(absPath, { uuid }) -> { method, location }
 *   method   : 'recycle-bin' | 'finder-trash' | 'gio' | 'trash-cli' | 'quarantine'
 *   location : null for native trash, or the quarantine path for the fallback.
 *
 * Reads the REAL environment (process.platform, os.homedir) - this is intentional;
 * trash is the platform edge. `uuid` groups quarantined files for recovery.
 */
export function sendToTrash(absPath, { uuid } = {}) {
  const platform = process.platform;
  const osId = detectOS(platform);

  if (osId === 'win32' && trashWin32(absPath)) {
    return { method: 'recycle-bin', location: null };
  }
  if (osId === 'darwin' && trashDarwin(absPath)) {
    return { method: 'finder-trash', location: null };
  }
  if (osId === 'linux') {
    if (hasCmd('gio')) {
      const res = spawnSync('gio', ['trash', absPath], { encoding: 'utf8' });
      if (!res.error && res.status === 0) return { method: 'gio', location: null };
    }
    if (hasCmd('trash')) {
      const res = spawnSync('trash', [absPath], { encoding: 'utf8' });
      if (!res.error && res.status === 0) {
        return { method: 'trash-cli', location: null };
      }
    }
  }

  // No native trash worked - quarantine instead of hard-deleting.
  const location = quarantine(absPath, { uuid, home: os.homedir(), platform });
  return { method: 'quarantine', location };
}

// Exposed for completeness / potential reuse by tests.
export { trashWin32, trashDarwin };
