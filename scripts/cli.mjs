#!/usr/bin/env node
// cli.mjs
//
// What: Entry point for claude-session-port. Dispatches argv[2] to a command module,
//       prints the command's output, and sets the process exit code.
// How:  This is one of the few IMPURE files: it reads the REAL environment
//       (process.platform, os.homedir, process.cwd, the system tar via child_process,
//       and the native trash) and bundles them into a `ctx` the pure-ish command
//       modules consume. That keeps core/ fully testable on any OS.
// Usage: node cli.mjs <list|export|import|delete> [args...]
//        node cli.mjs list --show <uuid|prefix>
// Deps:  node stdlib only (fs, os, path, child_process) + local modules.
//
// Exit codes (per the CLI contract):
//   0 ok | 2 no-match / bad-archive | 3 ambiguous | 4 bad-args | 5 already-exists
//   1 is reserved for an unexpected internal error.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { detectOS } from './core/platform.mjs';
import { runList } from './commands/list.mjs';
import { runExport } from './commands/export.mjs';
import { runImport } from './commands/import.mjs';
import { runDelete } from './commands/delete.mjs';
import { sendToTrash } from './platform/trash.mjs';

const USAGE = [
  'claude-session-port - portable Claude Code sessions',
  '',
  'usage:',
  '  list                              list this project\'s sessions (newest first)',
  '  list --show <uuid|prefix>         read-only info for one session',
  '  export <uuid|prefix> <dst-folder> export one session to <dst>/<uuid>.tar.gz',
  '  import <archive>                  import a .tar.gz (or legacy .zip) into this project',
  '  delete <uuid|prefix> [--hard] [--yes]   trash (default) or permanently delete a session',
].join('\n');

function buildCtx() {
  const platform = detectOS(process.platform);
  return {
    fs,
    // Use the OS-native path flavour so joins match what Claude Code wrote on disk.
    pathlib: platform === 'win32' ? path.win32 : path.posix,
    home: os.homedir(),
    os: platform,
    cwd: process.cwd(),
    tmpDir: os.tmpdir(),
    // tar invoked with an args ARRAY (no shell string) to survive spaces in paths.
    spawn: (cmd, args, opts) => spawnSync(cmd, args, opts),
    trash: (absPath, meta) => sendToTrash(absPath, meta),
    now: () => Date.now(),
    out: (line) => process.stdout.write(String(line) + '\n'),
  };
}

function main(argv) {
  const command = argv[2];
  const rest = argv.slice(3);
  const ctx = buildCtx();

  switch (command) {
    case 'list':
      return runList(rest, ctx);
    case 'export':
      return runExport(rest, ctx);
    case 'import':
      return runImport(rest, ctx);
    case 'delete':
      return runDelete(rest, ctx);
    case '-h':
    case '--help':
    case 'help':
      ctx.out(USAGE);
      return 0;
    case undefined:
      ctx.out(USAGE);
      return 4;
    default:
      ctx.out(`unknown command: ${command}`);
      ctx.out(USAGE);
      return 4;
  }
}

try {
  process.exitCode = main(process.argv);
} catch (err) {
  process.stderr.write(`error: ${err && err.message ? err.message : err}\n`);
  process.exitCode = 1;
}
