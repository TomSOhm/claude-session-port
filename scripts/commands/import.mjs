// commands/import.mjs
//
// What: `import <archive>` - extract a .tar.gz (or legacy .zip) bundle, read its
//       manifest, detokenize ${CSP_HOME} -> this machine's home, and land
//       <uuid>.jsonl (+ optional sidecar) into ~/.claude/projects/<encodeCwd(cwd)>/.
//       Refuses to overwrite an existing session of the same UUID.
// How:  Impure orchestration. The project folder is derived from THIS machine's cwd,
//       so resume works regardless of the source path.
// Deps: ctx = { fs, pathlib, home, os, cwd, out, spawn, tmpDir }.
//
// Exit codes: 0 ok / 2 bad-zip (no manifest / bad archive) / 5 already-exists /
//             4 bad-args (handled in cli.mjs).

import { encodeCwd } from '../core/encode.mjs';
import { projectDir } from '../core/platform.mjs';
import { parseManifest } from '../core/manifest.mjs';
import { detokenizeHome } from '../core/remap.mjs';
import { extract } from '../core/archive.mjs';
import { fmtSize } from '../core/format.mjs';
import { stripQuotes } from '../core/args.mjs';

/**
 * runImport([archive], ctx) -> exitCode
 */
export function runImport(args, ctx) {
  const src = stripQuotes((args.join(' ')).trim());
  if (!src) {
    ctx.out('usage: import <path-to-archive>');
    return 4;
  }
  const { fs, pathlib } = ctx;
  if (!fs.existsSync(src)) {
    ctx.out(`NO SRC: ${src}`);
    return 4;
  }

  const base = projectDir(ctx.home, ctx.os, encodeCwd(ctx.cwd));
  fs.mkdirSync(base, { recursive: true });

  // Fresh extraction dir under temp.
  const stem = pathlib.basename(src).replace(/\.(tar\.gz|tgz|zip)$/i, '');
  const tmp = pathlib.join(ctx.tmpDir, `csp-import-${stem}`);
  if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });

  try {
    extract(src, tmp, { spawn: ctx.spawn, fs, pathlib });
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    ctx.out(`BAD ARCHIVE: ${err.message}`);
    return 2;
  }

  const manPath = pathlib.join(tmp, 'manifest.json');
  if (!fs.existsSync(manPath)) {
    fs.rmSync(tmp, { recursive: true, force: true });
    ctx.out('BAD ARCHIVE: no manifest.json (not a /export_uuid export?)');
    return 2;
  }

  let man;
  try {
    man = parseManifest(fs.readFileSync(manPath, 'utf8'));
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    ctx.out(`BAD ARCHIVE: ${err.message}`);
    return 2;
  }

  const uuid = man.uuid;
  // Validate the session id from the (untrusted) manifest before joining it into paths:
  // reject separators / '..' / odd chars so a crafted archive cannot write outside the
  // project's session folder.
  if (typeof uuid !== 'string' || !/^[A-Za-z0-9_-]+$/.test(uuid)) {
    fs.rmSync(tmp, { recursive: true, force: true });
    ctx.out(`BAD ARCHIVE: unsafe session id ${JSON.stringify(uuid)}`);
    return 2;
  }
  const srcJsonl = pathlib.join(tmp, `${uuid}.jsonl`);
  if (!fs.existsSync(srcJsonl)) {
    fs.rmSync(tmp, { recursive: true, force: true });
    ctx.out(`BAD ARCHIVE: missing ${uuid}.jsonl`);
    return 2;
  }

  const dstJsonl = pathlib.join(base, `${uuid}.jsonl`);
  const dstSidecar = pathlib.join(base, uuid);
  // Refuse to overwrite an existing session - either the transcript OR a stale sidecar dir.
  const clash = fs.existsSync(dstJsonl)
    ? dstJsonl
    : fs.existsSync(dstSidecar)
      ? dstSidecar
      : null;
  if (clash) {
    fs.rmSync(tmp, { recursive: true, force: true });
    ctx.out(`ALREADY EXISTS: ${clash} - aborting (delete it first to replace).`);
    return 5;
  }

  // Land the transcript, detokenizing the home prefix back to THIS machine's home
  // (skip when the bundle is legacy / not tokenized).
  const text = fs.readFileSync(srcJsonl, 'utf8');
  const landed = man.homeTokenized ? detokenizeHome(text, ctx.home) : text;
  fs.writeFileSync(dstJsonl, landed);

  // Land the sidecar dir if present (detokenize each file the same way).
  const srcSide = pathlib.join(tmp, uuid);
  if (fs.existsSync(srcSide) && fs.statSync(srcSide).isDirectory()) {
    copyTreeDetokenized(srcSide, pathlib.join(base, uuid), ctx, man.homeTokenized);
  }

  fs.rmSync(tmp, { recursive: true, force: true });

  ctx.out(`Imported session ${uuid} -> ${base}`);
  if (man.sourceProjectPath) {
    ctx.out(`from source project: ${man.sourceProjectPath}`);
  }
  // Report the ACTUAL landed size (the file was just rewritten by detokenizeHome, so it can
  // differ from the source manifest's jsonlBytes). This is the value /resume will show, so
  // it stays a reliable SIZE-bridge key for /resume_title_uuid on this machine.
  const landedBytes = fs.statSync(dstJsonl).size;
  ctx.out(`Run /resume here; row size ${fmtSize(landedBytes)} (match this in the picker).`);
  return 0;
}

// Recursively copy + (optionally) detokenize a directory tree.
function copyTreeDetokenized(srcDir, destDir, ctx, homeTokenized) {
  const { fs, pathlib } = ctx;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = pathlib.join(srcDir, entry.name);
    const dest = pathlib.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyTreeDetokenized(src, dest, ctx, homeTokenized);
    } else {
      const text = fs.readFileSync(src, 'utf8');
      fs.writeFileSync(dest, homeTokenized ? detokenizeHome(text, ctx.home) : text);
    }
  }
}
