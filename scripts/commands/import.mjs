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
  const stem = baseName(src, pathlib).replace(/\.(tar\.gz|tgz|zip)$/i, '');
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
  const srcJsonl = pathlib.join(tmp, `${uuid}.jsonl`);
  if (!fs.existsSync(srcJsonl)) {
    fs.rmSync(tmp, { recursive: true, force: true });
    ctx.out(`BAD ARCHIVE: missing ${uuid}.jsonl`);
    return 2;
  }

  const dstJsonl = pathlib.join(base, `${uuid}.jsonl`);
  if (fs.existsSync(dstJsonl)) {
    fs.rmSync(tmp, { recursive: true, force: true });
    ctx.out(`ALREADY EXISTS: ${dstJsonl} - aborting (delete it first to replace).`);
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
  if (typeof man.jsonlBytes === 'number') {
    ctx.out(`Run /resume here; row size ~ ${round1(man.jsonlBytes / 1048576)}MB.`);
  } else {
    ctx.out('Run /resume here and pick the row by its size.');
  }
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

function baseName(p, pathlib) {
  return pathlib.basename(p);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function stripQuotes(s) {
  if (s.length >= 2) {
    const a = s[0];
    const b = s[s.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) return s.slice(1, -1);
  }
  return s;
}
