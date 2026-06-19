// core/archive.mjs
//
// What: Create and extract session bundles using the system `tar` (bsdtar ships on
//       Win10+/macOS/Linux). Produces `.tar.gz`; reads `.tar.gz` and legacy `.zip`.
// How:  Pure over an injected `spawn` (node:child_process.spawnSync) and `fs`/`pathlib`.
//       tar is ALWAYS invoked with an args ARRAY (never a shell string) so paths with
//       spaces survive. sniffFormat is pure (reads magic bytes via injected fs).
// Deps: injected { spawn, fs, pathlib }. The commands layer wires node:child_process,
//       node:fs and the right path flavour.
//
// createTarGz: tar -czf <out> -C <stageDir> .   (archive the staged tree's contents)
// extract:     tar -xzf <archive> -C <destDir>  (.tar.gz)
//              tar -xf  <archive> -C <destDir>   (.zip - bsdtar reads zip)
//
// WINDOWS/tar portability: GNU tar (the `tar` on Windows Git-Bash, which is how Claude
// Code runs Bash) treats an archive path like `C:\Users\you\x.tar.gz` as an rsh
// `host:path` and fails ("Cannot connect to C:"). bsdtar does not. To work on BOTH, we
// NEVER pass a drive-lettered path to `-f`: we spawn tar with cwd = the archive's
// directory and pass only the BASENAME to `-f`. The `-C <dir>` operands stay absolute
// (tar does not apply host:path parsing to `-C`).

/**
 * sniffFormat(file, { fs }) -> 'gzip' | 'zip' | 'unknown'
 * Extension first; if the extension is unhelpful, peek at the first 2 magic bytes:
 *   1f 8b => gzip (.tar.gz/.tgz),  50 4b ("PK") => zip.
 */
export function sniffFormat(file, { fs }) {
  const lower = String(file).toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'gzip';
  if (lower.endsWith('.zip')) return 'zip';
  // Ambiguous extension: read magic bytes.
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(2);
      fs.readSync(fd, buf, 0, 2, 0);
      if (buf[0] === 0x1f && buf[1] === 0x8b) return 'gzip';
      if (buf[0] === 0x50 && buf[1] === 0x4b) return 'zip';
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // fall through
  }
  return 'unknown';
}

// Split a path into { dir, base } using injected pathlib when available, else a
// separator-aware fallback (handles both `/` and `\` so it works regardless of OS).
function splitPath(p, pathlib) {
  if (pathlib && typeof pathlib.dirname === 'function' && typeof pathlib.basename === 'function') {
    return { dir: pathlib.dirname(p) || '.', base: pathlib.basename(p) };
  }
  const s = String(p);
  const idx = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  if (idx < 0) return { dir: '.', base: s };
  return { dir: s.slice(0, idx) || '.', base: s.slice(idx + 1) };
}

// Run tar with an args array; throw an actionable error if tar is missing or fails.
// `cwd` (optional) is the directory tar runs in - set so `-f` can be a bare basename.
function runTar(args, { spawn, cwd }) {
  let res;
  try {
    res = spawn('tar', args, { encoding: 'utf8', cwd });
  } catch (err) {
    throw new Error(`failed to spawn tar: ${err && err.message ? err.message : err}`);
  }
  if (res.error) {
    if (res.error.code === 'ENOENT') {
      throw new Error(
        "`tar` not found on PATH. Install bsdtar/GNU tar (ships with Windows 10+, macOS, and most Linux) and retry.",
      );
    }
    throw new Error(`tar failed to run: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const stderr = (res.stderr || '').toString().trim();
    throw new Error(`tar exited ${res.status}${stderr ? `: ${stderr}` : ''}`);
  }
  return res;
}

/**
 * createTarGz(stageDir, outFile, { spawn }) -> outFile
 * Archives the CONTENTS of stageDir (not the dir itself) into a gzip tarball.
 */
export function createTarGz(stageDir, outFile, { spawn, pathlib }) {
  // Spawn tar in the output directory and name the archive by basename only, so a
  // drive-lettered path (C:\...) is never handed to `-f` (GNU tar would misread it).
  const { dir, base } = splitPath(outFile, pathlib);
  runTar(['-czf', base, '-C', stageDir, '.'], { spawn, cwd: dir });
  return outFile;
}

/**
 * extract(archive, destDir, { spawn, fs }) -> { format }
 * Auto-detects gzip vs zip and runs the matching tar invocation. destDir must
 * already exist (the command layer creates it).
 */
export function extract(archive, destDir, { spawn, fs, pathlib }) {
  const format = sniffFormat(archive, { fs });
  // Run tar in the archive's directory; reference it by basename only (see header note).
  const { dir, base } = splitPath(archive, pathlib);
  if (format === 'gzip') {
    runTar(['-xzf', base, '-C', destDir], { spawn, cwd: dir });
  } else if (format === 'zip') {
    // bsdtar reads zip with plain -xf (no gzip flag).
    runTar(['-xf', base, '-C', destDir], { spawn, cwd: dir });
  } else {
    throw new Error(
      `unrecognized archive format for ${archive} (expected .tar.gz or .zip)`,
    );
  }
  return { format };
}
