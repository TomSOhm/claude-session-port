// commands/export.mjs
//
// What: `export <uuid|prefix> <dst-folder>` - resolve exactly one session, stage a
//       home-tokenized copy + optional sidecar + manifest.json, and write
//       <dst>/<uuid>.tar.gz. Prints the archive path and its contents.
// How:  Impure orchestration. Reads the project base from ctx.cwd, copies the .jsonl
//       (tokenizing the home prefix), recursively copies+tokenizes the sidecar, writes
//       a v2 manifest, tars the stage dir, then cleans the stage.
// Deps: ctx = { fs, pathlib, home, os, cwd, out, spawn, tmpDir }.
//
// Exit codes: 0 ok / 2 no-match / 3 ambiguous / 4 bad-args (4 handled in cli.mjs).

import { encodeCwd } from '../core/encode.mjs';
import { projectDir } from '../core/platform.mjs';
import { resolveOne } from '../core/sessions.mjs';
import { tokenizeHome } from '../core/remap.mjs';
import { buildManifest, stringifyManifest } from '../core/manifest.mjs';
import { createTarGz } from '../core/archive.mjs';
import { stripQuotes } from '../core/args.mjs';

/**
 * runExport([uuidOrPrefix, ...dstParts], ctx) -> exitCode
 * dst may contain spaces: it's the REST of argv joined with a single space, with
 * surrounding quotes stripped by cli.mjs. We re-join here defensively.
 */
export function runExport(args, ctx) {
  const uuidOrPrefix = args[0];
  const dst = stripQuotes(args.slice(1).join(' ').trim());
  if (!uuidOrPrefix || !dst) {
    ctx.out('usage: export <uuid|prefix> <dst-folder>');
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
  const full = s.uuid;

  // Ensure destination exists.
  fs.mkdirSync(dst, { recursive: true });

  // Fresh stage dir under the system temp.
  const stage = pathlib.join(ctx.tmpDir, `csp-export-${full}`);
  if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });

  // 1) Stage the transcript, tokenizing the home prefix.
  const jsonlText = fs.readFileSync(s.file, 'utf8');
  const tokenizedJsonl = tokenizeHome(jsonlText, ctx.home);
  fs.writeFileSync(pathlib.join(stage, `${full}.jsonl`), tokenizedJsonl);

  // 2) Stage the sidecar dir (if any), tokenizing each file's text.
  const hasSidecar = s.hasSidecar;
  if (hasSidecar) {
    copyTreeTokenized(s.sidecarDir, pathlib.join(stage, full), ctx);
  }

  // 3) Write the v2 manifest.
  const manifest = buildManifest({
    uuid: full,
    sourceProjectPath: ctx.cwd,
    encodedSource: encodeCwd(ctx.cwd),
    sourceOS: ctx.os,
    sourceHome: ctx.home,
    homeTokenized: true,
    jsonlBytes: s.bytes,
    hasSidecar,
  });
  fs.writeFileSync(pathlib.join(stage, 'manifest.json'), stringifyManifest(manifest));

  // 4) Archive the stage CONTENTS into <dst>/<uuid>.tar.gz (overwrite if present).
  const out = pathlib.join(dst, `${full}.tar.gz`);
  if (fs.existsSync(out)) fs.rmSync(out, { force: true });
  createTarGz(stage, out, { spawn: ctx.spawn, pathlib });

  // 5) Clean the stage.
  fs.rmSync(stage, { recursive: true, force: true });

  const kb = Math.trunc(fs.statSync(out).size / 1024);
  ctx.out(`Exported: ${out} (${kb} KB)`);
  ctx.out(`contents: ${full}.jsonl${hasSidecar ? ' + sidecar' : ''} + manifest.json`);
  return 0;
}

// Recursively copy a directory, tokenizing the home prefix in EVERY file's text.
// (Sidecar files are subagent transcripts - same text format - so tokenizing is safe.)
function copyTreeTokenized(srcDir, destDir, ctx) {
  const { fs, pathlib } = ctx;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = pathlib.join(srcDir, entry.name);
    const dest = pathlib.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyTreeTokenized(src, dest, ctx);
    } else {
      const text = fs.readFileSync(src, 'utf8');
      fs.writeFileSync(dest, tokenizeHome(text, ctx.home));
    }
  }
}
