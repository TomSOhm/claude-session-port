// commands/delete.mjs
//
// What: `delete <uuid|prefix> [--hard] [--yes]` - resolve exactly one session and
//       remove it. Default sends the .jsonl + sidecar to the native OS trash (with
//       quarantine fallback). `--hard` permanently deletes, but REQUIRES `--yes` or
//       it refuses and tells the caller confirmation is required.
// How:  Impure orchestration. Never touches `memory`. Aborts on 0/many matches.
// Deps: ctx = { fs, pathlib, home, os, cwd, out, trash }.
//       ctx.trash(absPath, { uuid }) -> { method, location }  (platform/trash.mjs).
//
// Exit codes: 0 ok / 2 no-match / 3 ambiguous / 4 bad-args (handled in cli.mjs).
//             For --hard without --yes we exit 4 (refused, needs confirmation).

import { encodeCwd } from '../core/encode.mjs';
import { projectDir } from '../core/platform.mjs';
import { resolveOne } from '../core/sessions.mjs';

/**
 * runDelete([uuidOrPrefix, ...flags], ctx) -> exitCode
 * Flags accepted in any order after the uuid: --hard, --yes.
 */
export function runDelete(args, ctx) {
  const positional = [];
  let hard = false;
  let yes = false;
  for (const a of args) {
    if (a === '--hard') hard = true;
    else if (a === '--yes') yes = true;
    else positional.push(a);
  }
  const uuidOrPrefix = positional[0];
  if (!uuidOrPrefix) {
    ctx.out('usage: delete <uuid|prefix> [--hard] [--yes]');
    return 4;
  }

  // --hard demands explicit confirmation; refuse without --yes (the wrapper asks).
  if (hard && !yes) {
    ctx.out(
      'REFUSED: --hard permanently deletes and requires --yes to confirm. Re-run with --yes after confirming.',
    );
    return 4;
  }

  const { fs, pathlib } = ctx;
  const base = projectDir(ctx.home, ctx.os, encodeCwd(ctx.cwd));
  const r = resolveOne(base, uuidOrPrefix, { fs, pathlib });
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
  // Extra safety: never operate on a `memory` target.
  if (s.uuid === 'memory') {
    ctx.out("REFUSED: 'memory' is not a session and is never deleted.");
    return 4;
  }

  if (hard) {
    fs.rmSync(s.file, { force: true });
    if (s.hasSidecar) fs.rmSync(s.sidecarDir, { recursive: true, force: true });
    ctx.out(`Permanently deleted: ${s.uuid}`);
    return 0;
  }

  // Default: native trash (with quarantine fallback inside ctx.trash).
  const fileRes = ctx.trash(s.file, { uuid: s.uuid });
  let sideRes = null;
  if (s.hasSidecar) sideRes = ctx.trash(s.sidecarDir, { uuid: s.uuid });

  reportTrash(ctx, s, fileRes, sideRes);
  return 0;
}

function reportTrash(ctx, s, fileRes, sideRes) {
  const label = methodLabel(fileRes.method);
  ctx.out(`Moved to ${label}: ${s.uuid}`);
  if (fileRes.method === 'quarantine' && fileRes.location) {
    ctx.out(`  transcript -> ${fileRes.location}`);
  }
  if (sideRes) {
    if (sideRes.method === 'quarantine' && sideRes.location) {
      ctx.out(`  sidecar    -> ${sideRes.location}`);
    } else {
      ctx.out('  sidecar    -> trashed');
    }
  }
}

function methodLabel(method) {
  switch (method) {
    case 'recycle-bin':
      return 'Recycle Bin';
    case 'finder-trash':
      return 'Finder Trash';
    case 'gio':
    case 'trash-cli':
      return 'Trash';
    case 'quarantine':
      return 'quarantine folder';
    default:
      return 'trash';
  }
}
